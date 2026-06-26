import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { OrchestratorService } from '../../../src/llm/agents/orchestrator.service';
import * as requirementAnalysisGraph from '../../../src/llm/graph/requirement-analysis-graph';
import type { ChatModelFactory, ChatModelLike } from '../../../src/llm/model.factory';

const CUSTOMER_INPUT = '我买的蓝牙耳机降噪效果不好，订单号 EC20240315001，昨天收到还没拆封，想退货';

function createScriptedModel(outputs: Record<string, string>) {
  const invokedAgents: string[] = [];
  const agentNames = Object.keys(outputs);
  let agentIndex = 0;
  const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
    const messages = promptValue.toChatMessages();
    const system = String(messages[0].content);
    const agentName = agentNames.find((name) => system.includes(name)) ?? agentNames[agentIndex];

    if (!agentName) {
      throw new Error(`Unexpected prompt: ${system}`);
    }

    agentIndex += 1;
    invokedAgents.push(agentName);
    return new AIMessage(outputs[agentName]);
  });

  return {
    invokedAgents,
    factory: (() => model) as unknown as ChatModelFactory,
  };
}

describe('OrchestratorService', () => {
  it('passes retrieved policy context into policy and summary agents', async () => {
    const seenPrompts: Record<string, string[]> = {};
    const outputs = {
      extractAgent: JSON.stringify({
        orderId: 'EC20240315001',
        productId: 'P-BT-001',
        requestType: 'return',
        receivedDate: '昨天',
        isUnopened: true,
      }),
      policyCheckAgent: '符合上传政策：return-policy.md 允许签收 7 天内未拆封退货。',
      riskReviewAgent: '低风险。',
      qaAgent: 'Given 上传退货政策允许\nWhen 用户申请退货\nThen 客服应批准退货',
      summaryAgent: '# 退货判断报告\n引用 return-policy.md，建议通过退货申请。',
    };
    const agentNames = Object.keys(outputs);
    let agentIndex = 0;
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const messages = promptValue.toChatMessages();
      const system = String(messages[0].content);
      const agentName = agentNames.find((name) => system.includes(name)) ?? agentNames[agentIndex];
      if (!agentName) {
        throw new Error(`Unexpected prompt: ${system}`);
      }

      seenPrompts[agentName] = messages.map((message) => String(message.content));
      agentIndex += 1;
      return new AIMessage(outputs[agentName as keyof typeof outputs]);
    });
    const service = new OrchestratorService((() => model) as unknown as ChatModelFactory);

    await service.orchestrate({
      input: CUSTOMER_INPUT,
      policyContext: '【参考文档 1】return-policy.md：签收 7 天内未拆封可退货。',
    } as any);

    expect(seenPrompts.policyCheckAgent.join('\n')).toContain('return-policy.md：签收 7 天内未拆封可退货');
    expect(seenPrompts.summaryAgent.join('\n')).toContain('return-policy.md：签收 7 天内未拆封可退货');
  });

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
      intent: 'analyze',
      reasoning: 'fallback: defaulted to analyze',
      queryResponse: null,
      chatResponse: null,
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

  it('continues when receivedDate is missing from extraction but present as a relative signed date in the input', async () => {
    const { factory } = createScriptedModel({
      extractAgent: JSON.stringify({
        orderId: 'EC20240315001',
        productId: 'P-BT-001',
        requestType: 'return',
        receivedDate: null,
        isUnopened: true,
      }),
      policyCheckAgent: '符合退货条件：昨天签收且未拆封。',
      riskReviewAgent: '低风险。',
      qaAgent: 'Given 昨天签收且未拆封\nWhen 用户申请退货\nThen 客服应进入退货流程',
      summaryAgent: '# 退货判断报告\n建议进入退货流程。',
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate(
      '订单号 EC20240315001，商品还没拆封，是昨天签收的，想知道能不能退。',
    );

    expect(result.mode).toBe('completed');
    expect(result.clarificationQuestions).not.toContain('请说明收货日期或签收时间。');
    expect(result.steps[1]).toEqual(
      expect.objectContaining({
        agent: 'policyCheckAgent',
        output: expect.stringContaining('符合退货条件'),
      }),
    );
  });

  it('falls back to manual review when any agent throws', async () => {
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const system = String(promptValue.toChatMessages()[0].content);

      if (system.includes('抽取')) {
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

  it('passes the chat model through to the analysis graph for routing decisions', async () => {
    const model = RunnableLambda.from(async () => new AIMessage('router-model'));
    const factory = jest.fn(() => model) as unknown as ChatModelFactory;
    const service = new OrchestratorService(factory);
    const spy = jest.spyOn(requirementAnalysisGraph, 'runAnalysisGraph').mockResolvedValue({
      mode: 'completed',
      clarificationQuestions: [],
      usedAgents: [],
      fallback: null,
      steps: [],
      report: '',
    });

    try {
      await service.orchestrate({
        input: '查询 REQ-20240315-001 的当前状态',
        policyContext: '无相关政策文档',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: '查询 REQ-20240315-001 的当前状态',
          policyContext: '无相关政策文档',
          agents: expect.any(Object),
          model,
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
