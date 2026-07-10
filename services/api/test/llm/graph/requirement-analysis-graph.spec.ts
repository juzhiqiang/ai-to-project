import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { runAnalysisGraph as runAnalysisGraphFromAgentEntry } from '../../../src/llm/agents/requirement-analysis';
import type { CustomerServiceAgents } from '../../../src/llm/agents/sub-agents';
import { createAnalysisSubGraph } from '../../../src/llm/graph/analysis-subgraph';
import { createAnalysisTools } from '../../../src/llm/graph/analysis-tools';
import { createAnalysisGraph, runAnalysisGraph } from '../../../src/llm/graph/requirement-analysis-graph';

const CUSTOMER_INPUT = '订单 EC20240315001，昨天签收，商品未拆封，我想申请退货。';

function createScriptedAgents(): CustomerServiceAgents {
  return {
    extractAgent: {
      invoke: jest.fn().mockResolvedValue(
        JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: '昨天',
          isUnopened: true,
        }),
      ),
    },
    policyCheckAgent: {
      invoke: jest.fn().mockResolvedValue('符合退货政策，可以进入退货流程。'),
    },
    riskReviewAgent: {
      invoke: jest.fn().mockResolvedValue('风险较低，但需要以订单系统时间为准。'),
    },
    qaAgent: {
      invoke: jest
        .fn()
        .mockResolvedValue('Given 用户已签收且未拆封\nWhen 用户申请退货\nThen 客服应允许进入退货流程'),
    },
    summaryAgent: {
      invoke: jest.fn().mockResolvedValue('# 退货判断报告\n建议允许用户发起退货申请。'),
    },
  } as unknown as CustomerServiceAgents;
}

type TriageRoute = {
  action: 'answer' | 'handoff_to_analysis' | 'handoff_to_risk';
  response?: string | null;
  reason?: string | null;
};

function createRouterModel(
  route: TriageRoute | Error,
  reply: string,
) {
  return {
    withStructuredOutput: jest.fn(() => ({
      invoke: route instanceof Error ? jest.fn().mockRejectedValue(route) : jest.fn().mockResolvedValue(route),
    })),
    invoke: jest.fn().mockResolvedValue({ content: reply }),
  } as any;
}

class FakeBoundToolModel {
  public readonly seenMessages: BaseMessage[][] = [];
  private responseIndex = 0;

  constructor(private readonly responses: AIMessage[]) {}

  public readonly invoke = jest.fn(async (messages: BaseMessage[]) => {
    this.seenMessages.push([...messages]);
    const response = this.responses[this.responseIndex] ?? new AIMessage('');
    this.responseIndex += 1;
    return response;
  });
}

function createToolCapableGraphModel(
  route: TriageRoute | Error,
  toolResponses: AIMessage[],
  reply = 'query or chat reply',
  supervisorRoute = { activeExperts: ['functional'], reasoning: 'default functional expert' },
) {
  let structuredInvokeIndex = 0;

  return {
    withStructuredOutput: jest.fn(() => ({
      invoke: jest.fn(async () => {
        const currentIndex = structuredInvokeIndex;
        structuredInvokeIndex += 1;

        if (currentIndex === 0) {
          if (route instanceof Error) {
            throw route;
          }

          return route;
        }

        if (
          currentIndex === 1 &&
          (route instanceof Error || route.action === 'handoff_to_analysis')
        ) {
          return supervisorRoute;
        }

        return { pass: true, critique: '', issues: [] };
      }),
    })),
    bindTools: jest.fn(() => new FakeBoundToolModel(toolResponses)),
    invoke: jest.fn().mockResolvedValue({ content: reply }),
  } as any;
}

describe('requirement analysis graph', () => {
  it('keeps the Ch6 agent entry as a graph delegate', () => {
    expect(runAnalysisGraphFromAgentEntry).toBe(runAnalysisGraph);
  });

  it('keeps the routed parent graph shape intact around the analysis node', () => {
    const graph = createAnalysisGraph();
    const graphShape = graph.getGraph();
    const edges = graphShape.edges.map(({ source, target, conditional }) => ({
      source,
      target,
      conditional,
    }));
    const edgeKey = ({ source, target }: { source: string; target: string }) => `${source}->${target}`;
    const sortEdges = <Edge extends { source: string; target: string }>(items: Edge[]) =>
      [...items].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));

    expect(sortEdges(edges)).toEqual(
      sortEdges([
        { source: '__start__', target: 'triage', conditional: false },
        { source: 'triage', target: 'extract', conditional: true },
        { source: 'triage', target: 'queryHandler', conditional: true },
        { source: 'triage', target: 'chatHandler', conditional: true },
        { source: 'triage', target: '__end__', conditional: true },
        { source: 'extract', target: 'clarify', conditional: false },
        { source: 'clarify', target: 'analysis_step', conditional: true },
        { source: 'clarify', target: 'risk_step', conditional: true },
        { source: 'analysis_step', target: 'risk_step', conditional: false },
        { source: 'risk_step', target: 'summary_step', conditional: false },
        { source: 'summary_step', target: '__end__', conditional: false },
        { source: 'queryHandler', target: '__end__', conditional: false },
        { source: 'chatHandler', target: '__end__', conditional: false },
      ]),
    );
  });

  it('still completes the analyze route and preserves the final summary report', async () => {
    const agents = createScriptedAgents();
    const model = createToolCapableGraphModel(
      { action: 'handoff_to_analysis', reason: 'new requirement analysis' },
      [
        new AIMessage(
          [
            '功能分解：退货资格判断。',
            '用户故事：作为客服，我希望快速判断退货资格。',
            '验收标准：给出是否可退、原因和后续动作。',
            '技术复杂度评估：低。',
          ].join('\n'),
        ),
      ],
      '# 閫€璐у垽鏂姤鍛奬n寤鸿鍏佽鐢ㄦ埛鍙戣捣閫€璐х敵璇枫€?',
    );

    const result = await runAnalysisGraph({
      input: CUSTOMER_INPUT,
      policyContext: '无相关政策文档',
      agents,
      model,
    } as any);

    expect(result.intent).toBe('analyze');
    expect(result.handoffReason).toBe('new requirement analysis');
    expect(result.mode).toBe('completed');
    expect(result.report.length).toBeGreaterThan(0);
    expect(result.usedAgents).toContain('extractAgent');
    expect(result.usedAgents).toContain('summaryAgent');
    expect(result.reviseCount).toBe(0);
    expect(result.critiqueIssues).toEqual([]);
  });

  it('answers directly from triage without running business nodes', async () => {
    const agents = createScriptedAgents();
    const model = createRouterModel(
      {
        action: 'answer',
        response: '查询结果：REQ-20240315-001 当前状态为处理中。',
        reason: 'triage can answer this request directly',
      },
      'unused reply',
    );

    const result = (await runAnalysisGraph({
      input: '查询 REQ-20240315-001 的当前状态',
      policyContext: '无相关政策文档',
      agents,
      model,
    } as any)) as any;

    expect(result.intent).toBe('chat');
    expect(result.chatResponse).toContain('处理中');
    expect(result.report).toContain('处理中');
    expect(result.handoffReason).toBe('triage can answer this request directly');
    expect(agents.extractAgent.invoke).not.toHaveBeenCalled();
    expect(agents.policyCheckAgent.invoke).not.toHaveBeenCalled();
    expect(agents.riskReviewAgent.invoke).not.toHaveBeenCalled();
    expect(agents.qaAgent.invoke).not.toHaveBeenCalled();
    expect(agents.summaryAgent.invoke).not.toHaveBeenCalled();
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it('hands off risk-only inputs directly to the risk and summary chain', async () => {
    const agents = createScriptedAgents();
    const model = createToolCapableGraphModel(
      { action: 'handoff_to_risk', reason: 'policy risk review is the primary work' },
      [new AIMessage('analysis should not run')],
    );

    const result = (await runAnalysisGraph({
      input: CUSTOMER_INPUT,
      policyContext: '无相关政策文档',
      agents,
      model,
    } as any)) as any;

    expect(result).toEqual(
      expect.objectContaining({
        intent: 'risk_only',
        handoffReason: 'policy risk review is the primary work',
        mode: 'completed',
      }),
    );
    expect(agents.extractAgent.invoke).toHaveBeenCalled();
    expect(agents.policyCheckAgent.invoke).not.toHaveBeenCalled();
    expect(agents.riskReviewAgent.invoke).toHaveBeenCalled();
    expect(agents.qaAgent.invoke).toHaveBeenCalled();
    expect(agents.summaryAgent.invoke).not.toHaveBeenCalled();
    expect(result.report).toBe('query or chat reply');
    expect(result.graphTrace).toEqual(expect.arrayContaining(['summary.actor', 'summary.critic']));
    expect(model.bindTools).not.toHaveBeenCalled();
  });

  it.each([
    ['ambiguous request id problem check', '看看 REQ-20240315-001 有没有问题', 'query'],
    ['request id progress question', 'REQ-20240415-002 的进度如何', 'query'],
    ['short new requirement', '我需要一个用户登录功能', 'analyze'],
    ['query analysis report boundary case', '查询 REQ-20240315-001 的风险分析报告', 'query'],
  ] as const)('falls back to keyword routing for %s', async (_name, input, expectedIntent) => {
    const agents = createScriptedAgents();
    const model =
      expectedIntent === 'analyze'
        ? createToolCapableGraphModel(
            new Error('structured output unavailable'),
            [
              new AIMessage(
                [
                  '功能分解：用户登录。',
                  '用户故事：作为用户，我希望登录系统。',
                  '验收标准：支持账号登录并返回成功状态。',
                  '技术复杂度评估：中。',
                ].join('\n'),
              ),
            ],
            '降级路由回复',
          )
        : createRouterModel(new Error('structured output unavailable'), '降级路由回复');

    const result = (await runAnalysisGraph({
      input,
      policyContext: '无相关政策文档',
      agents,
      model,
    } as any)) as any;

    expect(result.intent).toBe(expectedIntent);
    expect(result.reasoning).toContain('fallback');

    if (expectedIntent === 'query') {
      expect(result.queryResponse).toBe('降级路由回复');
      expect(agents.extractAgent.invoke).not.toHaveBeenCalled();
    } else {
      expect(agents.extractAgent.invoke).toHaveBeenCalled();
    }
  });

  it('generates analysis directly for plain input without a requirement id', async () => {
    const graph = createAnalysisSubGraph();
    const model = new FakeBoundToolModel([
      new AIMessage(
        [
          '功能分解：提供个人资料编辑。',
          '用户故事：作为用户，我希望修改昵称。',
          '验收标准：提交后昵称更新成功。',
          '技术复杂度评估：低。',
        ].join('\n'),
      ),
    ]);

    const state = await graph.invoke(
      {
        messages: [new HumanMessage('新增个人资料编辑功能')],
        toolLoopCount: 0,
        analysisResult: null,
      } as any,
      {
        context: {
          requirementAnalysis: {
            input: '新增个人资料编辑功能',
            policyContext: '无相关政策文档',
            agents: createScriptedAgents(),
            steps: [],
            analysisModel: model,
            graphTrace: [],
            analysisTools: createAnalysisTools(),
          },
        },
      } as any,
    );

    expect(state.analysisResult).toContain('功能分解');
    expect(state.toolLoopCount).toBe(0);
  });

  it('looks up requirement details before final analysis when input contains a req id', async () => {
    const searchRequirement = jest.fn().mockResolvedValue('REQ-100 detail');
    const graph = createAnalysisSubGraph();
    const model = new FakeBoundToolModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_req_lookup',
            name: 'search_requirement',
            args: { reqId: 'REQ-100' },
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage(
        [
          '功能分解：扩展已存在需求。',
          '用户故事：作为产品经理，我希望查看已有需求上下文。',
          '验收标准：分析基于查询到的详情输出。',
          '技术复杂度评估：中。',
        ].join('\n'),
      ),
    ]);

    const state = await graph.invoke(
      {
        messages: [new HumanMessage('分析 REQ-100 并补充方案')],
        toolLoopCount: 0,
        analysisResult: null,
      } as any,
      {
        context: {
          requirementAnalysis: {
            input: '分析 REQ-100 并补充方案',
            policyContext: '无相关政策文档',
            agents: createScriptedAgents(),
            steps: [],
            analysisModel: model,
            graphTrace: [],
            analysisTools: createAnalysisTools({ searchRequirement }),
          },
        },
      } as any,
    );

    expect(searchRequirement).toHaveBeenCalledWith('REQ-100');
    expect(state.toolLoopCount).toBe(1);
    expect(state.analysisResult).toContain('验收标准');
  });

  it('can trigger conflict detection for login and authentication requirements', async () => {
    const checkConflicts = jest.fn().mockResolvedValue({ hasConflict: true, reasons: ['SSO already exists'] });
    const graph = createAnalysisSubGraph();
    const model = new FakeBoundToolModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_conflict_check',
            name: 'check_conflicts',
            args: { reqId: 'REQ-200', description: '新增登录与单点登录能力' },
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage(
        [
          '功能分解：账号密码登录、单点登录。',
          '用户故事：作为用户，我希望安全登录。',
          '验收标准：发现认证方案冲突并给出建议。',
          '技术复杂度评估：中高。',
        ].join('\n'),
      ),
    ]);

    const state = await graph.invoke(
      {
        messages: [new HumanMessage('分析 REQ-200，新增登录与单点登录能力')],
        toolLoopCount: 0,
        analysisResult: null,
      } as any,
      {
        context: {
          requirementAnalysis: {
            input: '分析 REQ-200，新增登录与单点登录能力',
            policyContext: '无相关政策文档',
            agents: createScriptedAgents(),
            steps: [],
            analysisModel: model,
            graphTrace: [],
            analysisTools: createAnalysisTools({ checkConflicts }),
          },
        },
      } as any,
    );

    expect(checkConflicts).toHaveBeenCalled();
    expect(state.analysisResult).toContain('技术复杂度评估');
  });

  it('forces finalize after six tool loops to prevent infinite cycles', async () => {
    const graph = createAnalysisSubGraph();
    const model = new FakeBoundToolModel(
      Array.from(
        { length: 7 },
        () =>
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_loop',
                name: 'search_requirement',
                args: { reqId: 'REQ-300' },
                type: 'tool_call',
              },
            ],
          }),
      ),
    );

    const state = await graph.invoke(
      {
        messages: [new HumanMessage('分析 REQ-300')],
        toolLoopCount: 0,
        analysisResult: null,
      } as any,
      {
        context: {
          requirementAnalysis: {
            input: '分析 REQ-300',
            policyContext: '无相关政策文档',
            agents: createScriptedAgents(),
            steps: [],
            analysisModel: model,
            graphTrace: [],
            analysisTools: createAnalysisTools(),
          },
        },
      } as any,
    );

    expect(state.toolLoopCount).toBe(6);
    expect(state.analysisResult).toContain('达到工具调用上限');
  });

  it('writes analysisResult into the parent graph state and records the tool path', async () => {
    const trace: string[] = [];
    const graph = createAnalysisGraph();
    const model = createToolCapableGraphModel(
      { action: 'handoff_to_analysis', reason: 'req analysis' },
      [
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'call_req_lookup',
              name: 'search_requirement',
              args: { reqId: 'REQ-500' },
              type: 'tool_call',
            },
          ],
        }),
        new AIMessage(
          [
            '功能分解：补充登录能力。',
            '用户故事：作为用户，我希望更方便地登录。',
            '验收标准：给出现有需求上下文与实现建议。',
            '技术复杂度评估：中。',
          ].join('\n'),
        ),
      ],
    );

    const state = await graph.invoke(
      { messages: [] } as any,
      {
        context: {
          requirementAnalysis: {
            input: '分析 REQ-500，补充登录能力',
            policyContext: '无相关政策文档',
            agents: createScriptedAgents(),
            model,
            steps: [],
            graphTrace: trace,
          },
        },
      } as any,
    );

    expect(state.activeExperts).toEqual(['functional']);
    expect(state.functionalAnalysis).toContain('功能分解');
    expect(state.analysisResult).toContain('功能分解');
    expect(trace.join(' -> ')).toContain(
      'supervisor -> functional.agent -> functional.tools -> functional.agent -> functional.finalize -> functional -> aggregator',
    );
  });

  it('returns the real graph trace from the orchestrator result', async () => {
    const agents = createScriptedAgents();
    const model = createToolCapableGraphModel(
      { action: 'handoff_to_analysis', reason: 'req analysis with tools' },
      [
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'call_req_lookup',
              name: 'search_requirement',
              args: { reqId: 'REQ-600' },
              type: 'tool_call',
            },
          ],
        }),
        new AIMessage(
          [
            'feature breakdown: extend login',
            'user story: as a user, I want better login context',
            'acceptance criteria: produce a supplement based on existing requirement details',
            'technical complexity: medium',
          ].join('\n'),
        ),
      ],
    );

    const result = await runAnalysisGraph({
      input: 'Analyze REQ-600 and extend login capability',
      policyContext: 'No related policy docs',
      agents,
      model,
    } as any);

    expect(result.graphTrace?.join(' -> ')).toContain(
      'supervisor -> functional.agent -> functional.tools -> functional.agent -> functional.finalize -> functional -> aggregator',
    );
  });

  it('returns the execution error message when the graph falls back', async () => {
    const agents = createScriptedAgents();
    const model = createToolCapableGraphModel(
      { action: 'handoff_to_analysis', reason: 'model failure path' },
      [new AIMessage('unused')],
    );
    agents.extractAgent.invoke = jest.fn().mockRejectedValue(new Error('upstream model returned 502 Bad Gateway'));

    const result = await runAnalysisGraph({
      input: 'Analyze a new profile editing feature',
      policyContext: 'No related policy docs',
      agents,
      model,
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'fallback',
        fallback: 'manual_review',
        errorMessage: expect.stringContaining('upstream model returned 502 Bad Gateway'),
      }),
    );
  });

  it('allows disabling the graph timeout with graphTimeoutMs set to 0', async () => {
    const agents = createScriptedAgents();
    agents.extractAgent.invoke = jest.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                JSON.stringify({
                  orderId: 'EC20240315001',
                  productId: 'P-BT-001',
                  requestType: 'return',
                  receivedDate: '昨天',
                  isUnopened: true,
                }),
              ),
            20,
          );
        }),
    ) as any;

    const result = await runAnalysisGraph({
      input: CUSTOMER_INPUT,
      policyContext: '无相关政策文档',
      agents,
      model: createToolCapableGraphModel(
        { action: 'handoff_to_analysis', reason: 'timeout disabled path' },
        [
          new AIMessage(
            [
              '功能分解：退货资格判断。',
              '用户故事：作为客服，我希望快速判断退货资格。',
              '验收标准：给出是否可退、原因和后续动作。',
              '技术复杂度评估：低。',
            ].join('\n'),
          ),
        ],
      ),
      graphTimeoutMs: 0,
    } as any);

    expect(result.mode).toBe('completed');
    expect(result.errorMessage).toBeUndefined();
  });

  it('falls back with a timeout message when graph execution takes too long', async () => {
    const agents = createScriptedAgents();
    agents.extractAgent.invoke = jest.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(JSON.stringify({ orderId: 'REQ-SLOW' })), 50);
        }),
    ) as any;

    const result = await runAnalysisGraph({
      input: 'Analyze a slow requirement',
      policyContext: 'No related policy docs',
      agents,
      model: createToolCapableGraphModel(
        { action: 'handoff_to_analysis', reason: 'slow path' },
        [new AIMessage('unused')],
      ),
      graphTimeoutMs: 1,
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'fallback',
        fallback: 'manual_review',
        errorMessage: expect.stringContaining('timed out after 1ms'),
      }),
    );
  });
});
