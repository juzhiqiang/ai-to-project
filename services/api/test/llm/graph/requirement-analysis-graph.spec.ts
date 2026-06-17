import { createAnalysisGraph, runAnalysisGraph } from '../../../src/llm/graph/requirement-analysis-graph';
import { runAnalysisGraph as runAnalysisGraphFromAgentEntry } from '../../../src/llm/agents/requirement-analysis';
import type { CustomerServiceAgents } from '../../../src/llm/agents/sub-agents';

const CUSTOMER_INPUT = '我买的蓝牙耳机降噪效果不好，订单号 EC20240315001，昨天收到还没拆封，想退货';

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
      invoke: jest.fn().mockResolvedValue('符合退货条件：昨天收到且未拆封，可按退货政策处理；退款按原路退回。'),
    },
    riskReviewAgent: {
      invoke: jest.fn().mockResolvedValue('风险点：需以订单系统中的签收时间为准。'),
    },
    qaAgent: {
      invoke: jest
        .fn()
        .mockResolvedValue('Given 订单已签收且商品未拆封\nWhen 用户申请退货\nThen 客服应批准进入退货流程'),
    },
    summaryAgent: {
      invoke: jest.fn().mockResolvedValue('# 退货判断报告\n建议通过退货申请。'),
    },
  } as unknown as CustomerServiceAgents;
}

describe('requirement analysis graph', () => {
  it('keeps the Ch6 agent entry as a graph delegate', () => {
    expect(runAnalysisGraphFromAgentEntry).toBe(runAnalysisGraph);
  });

  it('compiles the five-stage graph in the task order', () => {
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
        { source: '__start__', target: 'extract', conditional: false },
        { source: 'clarify', target: 'analysis_step', conditional: false },
        { source: 'analysis_step', target: 'risk_step', conditional: false },
        { source: 'extract', target: 'clarify', conditional: false },
        { source: 'risk_step', target: 'summary_step', conditional: false },
        { source: 'summary_step', target: '__end__', conditional: false },
      ]),
    );
  });

  it('writes each required business field into state', async () => {
    const agents = createScriptedAgents();
    const graph = createAnalysisGraph();

    const state = await graph.invoke(
      { messages: [] },
      {
        context: {
          requirementAnalysis: {
            input: CUSTOMER_INPUT,
            policyContext: '无相关政策文档',
            agents,
            steps: [],
          },
        },
      },
    );

    expect(state).toEqual(
      expect.objectContaining({
        extracted: expect.objectContaining({ orderId: 'EC20240315001' }),
        clarified: { questions: [] },
        analysis: '符合退货条件：昨天收到且未拆封，可按退货政策处理；退款按原路退回。',
        risk: '风险点：需以订单系统中的签收时间为准。',
        summary: '# 退货判断报告\n建议通过退货申请。',
      }),
    );
  });

  it('runs the five-stage graph and keeps the old chain summary output', async () => {
    const agents = createScriptedAgents();

    const result = await runAnalysisGraph({
      input: CUSTOMER_INPUT,
      policyContext: '无相关政策文档',
      agents,
    });

    expect(result).toEqual({
      mode: 'completed',
      clarificationQuestions: [],
      usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
      fallback: null,
      steps: [
        expect.objectContaining({ agent: 'extractAgent', output: expect.stringContaining('EC20240315001') }),
        expect.objectContaining({ agent: 'policyCheckAgent', output: expect.stringContaining('符合退货条件') }),
        expect.objectContaining({ agent: 'riskReviewAgent', output: expect.stringContaining('风险点') }),
        expect.objectContaining({ agent: 'qaAgent', output: expect.stringContaining('Given') }),
        expect.objectContaining({ agent: 'summaryAgent', output: '# 退货判断报告\n建议通过退货申请。' }),
      ],
      report: '# 退货判断报告\n建议通过退货申请。',
    });
  });
});
