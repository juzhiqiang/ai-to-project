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
})

import { TokenUsageService, type TokenUsageRecord, type MonthlyStats } from '../src/llm/cost/token-usage.service';
import { withTokenUsage, type WithTokenUsageOptions } from '../src/llm/cost/with-token-usage';

// Mock Prisma client
const mockPrisma = {
  tokenUsage: {
    create: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue({
      _sum: { estimatedCostUsd: 10.5, inputTokens: 1000, outputTokens: 500, cachedInputTokens: 100 },
      _count: 5,
    }),
    groupBy: jest.fn().mockResolvedValue([
      { nodeName: 'supervisor', _sum: { estimatedCostUsd: 5.0 }, _count: 2 },
      { nodeName: 'functional', _sum: { estimatedCostUsd: 3.5 }, _count: 3 },
    ]),
  },
};

describe('10.8.2 TokenUsageService', () => {
  let service: TokenUsageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenUsageService(mockPrisma as any);
  });

  it('recordUsage writes complete fields to prisma', async () => {
    const record: TokenUsageRecord = {
      graphName: 'analysis-graph',
      nodeName: 'supervisor',
      agentName: 'supervisor',
      modelName: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
      isEstimated: false,
      latencyMs: 100,
    };

    await service.recordUsage(record);

    expect(mockPrisma.tokenUsage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        graphName: 'analysis-graph',
        nodeName: 'supervisor',
        agentName: 'supervisor',
        modelName: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.001,
        isEstimated: false,
        latencyMs: 100,
        provider: 'openai',
      }),
    });
  });

  it('getMonthlyStats aggregates totalCost and tokens for current month', async () => {
    const stats = await service.getMonthlyStats();

    expect(stats.totalCost).toBe(10.5);
    expect(stats.totalInputTokens).toBe(1000);
    expect(stats.totalOutputTokens).toBe(500);
    expect(stats.totalCachedTokens).toBe(100);
    expect(stats.calls).toBe(5);
  });

  it('getStatsByNode aggregates and orders by totalCost descending', async () => {
    const stats = await service.getStatsByNode();

    expect(stats).toHaveLength(2);
    expect(stats[0].nodeName).toBe('supervisor');
    expect(stats[0].totalCost).toBe(5.0);
    expect(stats[1].nodeName).toBe('functional');
  });

  it('getStatsByAgent aggregates and orders by totalCost descending', async () => {
    mockPrisma.tokenUsage.groupBy.mockResolvedValueOnce([
      { agentName: 'supervisor', _sum: { estimatedCostUsd: 8.0 }, _count: 4 },
      { agentName: 'functional', _sum: { estimatedCostUsd: 2.5 }, _count: 3 },
    ]);

    const stats = await service.getStatsByAgent();

    expect(stats).toHaveLength(2);
    expect(stats[0].agentName).toBe('supervisor');
    expect(stats[0].totalCost).toBe(8.0);
  });

  it('isOverBudget returns true when totalCost exceeds budget', async () => {
    mockPrisma.tokenUsage.aggregate.mockResolvedValueOnce({
      _sum: { estimatedCostUsd: 15 },
      _count: 10,
    } as any);

    const result = await service.isOverBudget(10);

    expect(result).toBe(true);
  });

  it('isOverBudget returns false when totalCost is under budget', async () => {
    mockPrisma.tokenUsage.aggregate.mockResolvedValueOnce({
      _sum: { estimatedCostUsd: 5 },
      _count: 5,
    } as any);

    const result = await service.isOverBudget(10);

    expect(result).toBe(false);
  });

  it('recordUsage does not throw when prisma throws', async () => {
    mockPrisma.tokenUsage.create.mockRejectedValueOnce(new Error('DB error'));

    const record: TokenUsageRecord = {
      graphName: 'test',
      nodeName: 'test',
      agentName: 'test',
      modelName: 'test',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      isEstimated: false,
      latencyMs: 0,
    };

    // Should not throw
        // 调用 should not throw - error is caught internally
    await service.recordUsage(record);
    // If we reach here, no error was thrown (which is the expected behavior)
  });
});

describe('10.8.3 withTokenUsage', () => {
  it('records exact input/output/cached when response has usage metadata', async () => {
    const mockService = {
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };

    const mockResponse = {
      content: 'Hello world',
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 50,
      },
    };

    const options: WithTokenUsageOptions = {
      graphName: 'test-graph',
      nodeName: 'supervisor',
      agentName: 'supervisor',
      modelName: 'gpt-4o',
    };

    await withTokenUsage(options, mockService as any, async () => mockResponse);

    expect(mockService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
        isEstimated: false,
      }),
    );
  });

  it('uses fallback estimation when no usage metadata (input = output * 5, isEstimated=true)', async () => {
    const mockService = {
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };

    // Response without usage metadata
    const mockResponse = {
      content: 'Short answer',
    };

    const options: WithTokenUsageOptions = {
      graphName: 'test-graph',
      nodeName: 'supervisor',
      agentName: 'supervisor',
      modelName: 'gpt-4o',
    };

    await withTokenUsage(options, mockService as any, async () => mockResponse);

    // "Short answer" = 4 Chinese chars + 12 English = ~7 tokens output
    // input = output * 5 = 35
    expect(mockService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 15,
        outputTokens: 3,
        isEstimated: true,
      }),
    );
  });

  it('still returns model response when recordUsage throws', async () => {
    const mockService = {
      recordUsage: jest.fn().mockRejectedValue(new Error('DB error')),
    };

    const mockResponse = { content: 'Test response' };

    const options: WithTokenUsageOptions = {
      graphName: 'test-graph',
      nodeName: 'supervisor',
      agentName: 'supervisor',
      modelName: 'gpt-4o',
    };

    const result = await withTokenUsage(options, mockService as any, async () => mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('skips recording when usageService is null', async () => {
    const mockFn = jest.fn().mockResolvedValue({ content: 'Test' });

    const options: WithTokenUsageOptions = {
      graphName: 'test-graph',
      nodeName: 'supervisor',
      agentName: 'supervisor',
      modelName: 'gpt-4o',
    };

    const result = await withTokenUsage(options, null, mockFn);

    expect(mockFn).toHaveBeenCalled();
    expect(result).toEqual({ content: 'Test' });
  });
})

import { resolveBudgetAction, type BudgetPolicyInput } from '../src/llm/cost/budget-policy';

describe('10.9.3 预算动作选择 - resolveBudgetAction', () => {
  it('50% 预算 → allow', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 50,
      agentName: 'functional_expert',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
    expect(result.reason).toContain('50');
  });

  it('85% 预算 + functional → downgrade，reason 含 85', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 85,
      agentName: 'functional_expert',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('downgrade');
    expect(result.reason).toContain('85');
    expect(result.reason).toContain('downgrade');
  });

  it('90% 预算 + security_expert → allow（高风险不降级）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 90,
      agentName: 'security_expert',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
    expect(result.reason).toContain('90');
    expect(result.reason).toContain('high-risk');
  });

  it('110% 预算 + risk_agent → reject', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 110,
      agentName: 'risk_agent',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('reject');
    expect(result.reason).toContain('110');
    expect(result.reason).toContain('exceeded');
  });

  it('110% 预算 + compressor → allow（豁免）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 110,
      agentName: 'compressor',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
    expect(result.reason).toContain('compressor');
  });

  it('79% 预算 → allow（边界）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 79,
      agentName: 'functional_expert',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
  });

  it('80% 预算 + high-risk → allow（边界）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 80,
      agentName: 'supervisor',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
    expect(result.reason).toContain('high-risk');
  });

  it('100% 预算 + compressor → allow（边界）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 100,
      agentName: 'compressor',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('allow');
  });

  it('100% 预算 + non-compressor → reject（边界）', () => {
    const input: BudgetPolicyInput = {
      budgetUsedPercent: 100,
      agentName: 'functional_expert',
    };
    const result = resolveBudgetAction(input);

    expect(result.action).toBe('reject');
  });
});
