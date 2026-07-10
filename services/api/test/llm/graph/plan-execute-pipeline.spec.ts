import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { CustomerServiceAgents } from '../../../src/llm/agents/sub-agents';
import { runPlanExecutePipeline } from '../../../src/llm/graph/plan-execute-pipeline';

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
      invoke: jest.fn().mockResolvedValue('符合退货政策。'),
    },
    riskReviewAgent: {
      invoke: jest.fn().mockResolvedValue('风险较低。'),
    },
    qaAgent: {
      invoke: jest.fn().mockResolvedValue('Given 未拆封\nWhen 申请退货\nThen 允许进入退货流程'),
    },
    summaryAgent: {
      invoke: jest.fn().mockResolvedValue('# 子任务报告\n允许退货。'),
    },
  } as unknown as CustomerServiceAgents;
}

function createPipelineModel(structuredResponses: unknown[]) {
  let structuredIndex = 0;

  return {
    withStructuredOutput: jest.fn(() => ({
      invoke: jest.fn(async () => {
        const response = structuredResponses[structuredIndex];
        structuredIndex += 1;

        if (response instanceof Error) {
          throw response;
        }

        return response;
      }),
    })),
    bindTools: jest.fn(
      () =>
        ({
          invoke: jest.fn(async (_messages: BaseMessage[]) =>
            new AIMessage(
              [
                '功能分解：退货资格判断。',
                '用户故事：作为客服，我希望快速判断资格。',
                '验收标准：输出是否可退和下一步。',
                '技术复杂度评估：低。',
              ].join('\n'),
            ),
          ),
        }) as any,
    ),
    invoke: jest.fn().mockResolvedValue({ content: '# 子任务报告\n允许退货。' }),
  } as any;
}

describe('plan execute pipeline graph', () => {
  it('plans steps, executes each step with child thread ids, and returns the evaluated report', async () => {
    const model = createPipelineModel([
      {
        steps: [
          { id: 'policy', description: '核对退货政策' },
          { id: 'risk', description: '复核风险和人工审核条件' },
        ],
      },
      { action: 'handoff_to_analysis', reason: 'policy analysis' },
      { activeExperts: ['functional'], reasoning: 'functional enough' },
      { pass: true, critique: '', issues: [] },
      { action: 'handoff_to_analysis', reason: 'risk analysis' },
      { activeExperts: ['functional'], reasoning: 'functional enough' },
      { pass: true, critique: '', issues: [] },
      { pass: true, reason: 'combined report is complete', finalReport: '# 联合分析报告\n可以退货。' },
    ]);

    const result = await runPlanExecutePipeline({
      input: CUSTOMER_INPUT,
      policyContext: '7 天内未拆封可退货。',
      agents: createScriptedAgents(),
      model,
      parentThreadId: 'thread-parent',
    });

    expect(result.plan).toEqual([
      { id: 'policy', description: '核对退货政策', done: true },
      { id: 'risk', description: '复核风险和人工审核条件', done: true },
    ]);
    expect(result.stepResults.policy.threadId).toBe('thread-parent:step-0');
    expect(result.stepResults.risk.threadId).toBe('thread-parent:step-1');
    expect(result.finalReport).toBe('# 联合分析报告\n可以退货。');
    expect(result.reflections).toEqual([]);
  });

  it('reflects once, reruns from the first revised step, and then stops at the retry limit', async () => {
    const model = createPipelineModel([
      { steps: [{ id: 'first-pass', description: '初版联合分析' }] },
      { action: 'handoff_to_analysis', reason: 'first pass' },
      { activeExperts: ['functional'], reasoning: 'first expert' },
      { pass: true, critique: '', issues: [] },
      { pass: false, reason: '缺少跨工单对比', finalReport: '# 初版报告\n信息不足。' },
      {
        reflection: '补充跨工单对比维度后重跑。',
        revisedSteps: [{ id: 'revised-pass', description: '补充跨工单对比' }],
      },
      { action: 'handoff_to_analysis', reason: 'revised pass' },
      { activeExperts: ['functional'], reasoning: 'revised expert' },
      { pass: true, critique: '', issues: [] },
      { pass: false, reason: '仍需人工复核', finalReport: '# 修订报告\n需要人工复核。' },
    ]);

    const result = await runPlanExecutePipeline({
      input: CUSTOMER_INPUT,
      policyContext: '7 天内未拆封可退货。',
      agents: createScriptedAgents(),
      model,
      parentThreadId: 'thread-parent',
    });

    expect(result.retryCount).toBe(1);
    expect(result.reflections).toEqual(['补充跨工单对比维度后重跑。']);
    expect(result.plan).toEqual([{ id: 'revised-pass', description: '补充跨工单对比', done: true }]);
    expect(result.stepResults).toHaveProperty('revised-pass');
    expect(result.stepResults).not.toHaveProperty('first-pass');
    expect(result.finalReport).toBe('# 修订报告\n需要人工复核。');
  });
});
