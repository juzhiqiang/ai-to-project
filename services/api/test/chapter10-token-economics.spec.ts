import {
  estimateGraphNodeCost,
  estimateTextTokens,
  getModelPricing,
} from '../src/llm/cost/token-estimator';

describe('chapter 10 token economics estimator', () => {
  it('returns zero tokens for empty values', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens(null as unknown as string)).toBe(0);
    expect(estimateTextTokens(undefined as unknown as string)).toBe(0);
  });

  it('counts Chinese text as non-zero token usage', () => {
    expect(estimateTextTokens('需求分析，包含中文标点。')).toBeGreaterThan(0);
  });

  it('estimates English text at roughly one token per four characters', () => {
    expect(estimateTextTokens('abcdefghijklmnop')).toBe(4);
    expect(estimateTextTokens('abcde')).toBe(2);
  });

  it('falls back unknown model pricing to gpt-4o-mini', () => {
    expect(getModelPricing('unknown-model')).toEqual(getModelPricing('gpt-4o-mini'));
  });

  it('estimates higher cost when tool schemas are included', () => {
    const baseInput = {
      nodeName: 'supervisor',
      modelName: 'gpt-4o-mini',
      systemPrompt: 'Route the requirement to experts.',
      messages: ['Analyze a CRM requirement.'],
      outputText: 'Use functional and risk experts.',
    };

    const withoutTools = estimateGraphNodeCost(baseInput);
    const withTools = estimateGraphNodeCost({
      ...baseInput,
      toolSchemas: [
        {
          name: 'handoff_to_functional_expert',
          description: 'Transfer analysis to the functional expert.',
          parameters: { type: 'object', properties: { reason: { type: 'string' } } },
        },
      ],
    });

    expect(withTools.inputTokens).toBeGreaterThan(withoutTools.inputTokens);
    expect(withTools.estimatedCostUsd).toBeGreaterThan(withoutTools.estimatedCostUsd);
  });

  it('charges output tokens with the model output price', () => {
    const result = estimateGraphNodeCost({
      nodeName: 'aggregator',
      modelName: 'gpt-4o-mini',
      systemPrompt: '',
      messages: [],
      outputText: 'abcdefghijklmnop',
    });

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(4);
    expect(result.estimatedCostUsd).toBe((4 * getModelPricing('gpt-4o-mini').output) / 1_000_000);
  });
})

import {
  resolveModelForAgent,
  DEFAULT_AGENT_MODEL_SET,
  HIGH_RISK_AGENTS,
  type AgentName,
  type AgentModelSet,
  type ResolveModelResult,
} from '../src/llm/cost/agent-model-set';

describe('10.9.1 AgentModelSet', () => {
  it('默认按角色返回不同 modelConfigId', () => {
    const supervisors = resolveModelForAgent({ agentName: 'supervisor' });
    expect(supervisors.selectedModelConfigId).toBe('demo-gpt-4o');

    const functional = resolveModelForAgent({ agentName: 'functional_expert' });
    expect(functional.selectedModelConfigId).toBe('demo-gpt-4o-mini');

    const compressor = resolveModelForAgent({ agentName: 'compressor' });
    expect(compressor.selectedModelConfigId).toBe('demo-deepseek-chat');
  });

  it('高风险 5 个角色默认 demo-gpt-4o', () => {
    const highRiskAgents: AgentName[] = ['supervisor', 'security_expert', 'compliance_expert', 'summary_agent', 'critic'];
    for (const agent of highRiskAgents) {
      const result = resolveModelForAgent({ agentName: agent });
      expect(result.selectedModelConfigId).toBe('demo-gpt-4o');
    }
  });

  it('低复杂度时 functional 降级到 demo-deepseek-chat 并附 overrideReason 含 low_complexity', () => {
    const result = resolveModelForAgent({
      agentName: 'functional_expert',
      requirementComplexity: 'low',
    });
    expect(result.selectedModelConfigId).toBe('demo-deepseek-chat');
    expect(result.overrideReason).toBe('low_complexity_downgrade');
  });
});

describe('10.9.2 运行时模型覆盖', () => {
  it('85% 预算时 functional 降级', () => {
    const result = resolveModelForAgent({
      agentName: 'functional_expert',
      budgetStatus: { usedPercent: 85 },
    });
    expect(result.selectedModelConfigId).toBe('demo-deepseek-chat');
    expect(result.overrideReason).toContain('budget_tight_downgrade');
    expect(result.overrideReason).toContain('85');
  });

  it('90% 预算时 security 仍是 demo-gpt-4o', () => {
    const result = resolveModelForAgent({
      agentName: 'security_expert',
      budgetStatus: { usedPercent: 90 },
    });
    expect(result.selectedModelConfigId).toBe('demo-gpt-4o');
    expect(result.overrideReason).toBeNull();
  });

  it('110% 预算时返回 budget_exceeded_reject reason', () => {
    const result = resolveModelForAgent({
      agentName: 'functional_expert',
      budgetStatus: { usedPercent: 110 },
    });
    expect(result.selectedModelConfigId).toBe('demo-gpt-4o-mini');
    expect(result.overrideReason).toBe('budget_exceeded_reject');
  });

  it('110% 预算时 compressor 仍可用且 reason=null', () => {
    const result = resolveModelForAgent({
      agentName: 'compressor',
      budgetStatus: { usedPercent: 110 },
    });
    expect(result.selectedModelConfigId).toBe('demo-deepseek-chat');
    expect(result.overrideReason).toBeNull();
  });

  it('任何 override 路径 overrideReason 不为空', () => {
    const scenarios = [
      { agentName: 'functional_expert', budgetStatus: { usedPercent: 85 }, expectNonNull: true },
      { agentName: 'functional_expert', requirementComplexity: 'low', expectNonNull: true },
      { agentName: 'functional_expert', budgetStatus: { usedPercent: 110 }, expectNonNull: true },
      { agentName: 'compressor', budgetStatus: { usedPercent: 110 }, expectNonNull: false },
      { agentName: 'supervisor', budgetStatus: { usedPercent: 50 }, expectNonNull: false },
    ];

    for (const scenario of scenarios) {
      const result = resolveModelForAgent(scenario as any);
      if (scenario.expectNonNull) {
        expect(result.overrideReason).not.toBeNull();
      } else {
        expect(result.overrideReason).toBeNull();
      }
    }
  });
});
