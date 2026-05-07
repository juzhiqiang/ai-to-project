import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { OrchestratorService } from '../../../src/llm/agents/orchestrator.service';
import type { ChatModelFactory, ChatModelLike } from '../../../src/llm/model.factory';

const CUSTOMER_INPUT = '我买的蓝牙耳机降噪效果不好，订单号 EC20240315001，昨天收到还没拆封，想退货';

function createScriptedModel(outputs: Record<string, string>) {
  const invokedAgents: string[] = [];
  const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
    const messages = promptValue.toChatMessages();
    const system = String(messages[0].content);
    const agentName = Object.keys(outputs).find((name) => system.includes(name));

    if (!agentName) {
      throw new Error(`Unexpected prompt: ${system}`);
    }

    invokedAgents.push(agentName);
    return new AIMessage(outputs[agentName]);
  });

  return {
    invokedAgents,
    factory: (() => model) as unknown as ChatModelFactory,
  };
}

describe('OrchestratorService', () => {
  it('runs the fixed workflow and returns a final report', async () => {
    const { factory, invokedAgents } = createScriptedModel({
      extractAgent: JSON.stringify({
        orderId: 'EC20240315001',
        productId: 'P-BT-001',
        requestType: 'return',
        receivedDate: '昨天',
        isUnopened: true,
      }),
      policyCheckAgent: '符合退货条件：昨天收到且未拆封，可按退货政策处理；退款按原路退回。',
      riskReviewAgent: '风险点：需以订单系统中的签收时间为准。',
      qaAgent: 'Given 订单已签收且商品未拆封\nWhen 用户申请退货\nThen 客服应批准进入退货流程',
      summaryAgent: '# 退货判断报告\n建议通过退货申请。',
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate(CUSTOMER_INPUT);

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
        expect.objectContaining({ agent: 'summaryAgent', output: expect.stringContaining('退货判断报告') }),
      ],
      report: '# 退货判断报告\n建议通过退货申请。',
    });
    expect(invokedAgents).toEqual(['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent']);
  });

  it('stops after extraction and asks clarification questions when key fields are missing', async () => {
    const { factory, invokedAgents } = createScriptedModel({
      extractAgent: JSON.stringify({
        orderId: null,
        productId: null,
        requestType: 'return',
        receivedDate: null,
        isUnopened: null,
      }),
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate('我想退货');

    expect(result.mode).toBe('clarification');
    expect(result.usedAgents).toEqual(['extractAgent']);
    expect(result.fallback).toBeNull();
    expect(result.report).toBe('');
    expect(result.clarificationQuestions).toEqual([
      '请提供订单号。',
      '请说明收货日期或签收时间。',
      '请确认商品是否未拆封。',
    ]);
    expect(invokedAgents).toEqual(['extractAgent']);
  });

  it('falls back to manual review when any agent throws', async () => {
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const system = String(promptValue.toChatMessages()[0].content);

      if (system.includes('extractAgent')) {
        return new AIMessage(
          JSON.stringify({
            orderId: 'EC20240315001',
            productId: 'P-BT-001',
            requestType: 'return',
            receivedDate: '昨天',
            isUnopened: true,
          }),
        );
      }

      throw new Error('policy model unavailable');
    });
    const service = new OrchestratorService((() => model) as unknown as ChatModelFactory);

    await expect(service.orchestrate(CUSTOMER_INPUT)).resolves.toEqual(
      expect.objectContaining({
        mode: 'fallback',
        fallback: 'manual_review',
        report: '',
        usedAgents: ['extractAgent'],
        steps: [expect.objectContaining({ agent: 'extractAgent' })],
      }),
    );
  });
});
