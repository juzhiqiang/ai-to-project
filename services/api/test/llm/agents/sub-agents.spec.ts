import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { buildCustomerServiceAgents, CUSTOMER_SERVICE_AGENT_NAMES } from '../../../src/llm/agents/sub-agents';

describe('buildCustomerServiceAgents', () => {
  it('builds five prompt-model-parser agents with dedicated roles', async () => {
    const seenMessages: BaseMessage[][] = [];
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const messages = promptValue.toChatMessages();
      seenMessages.push(messages);

      return new AIMessage(`agent-output:${seenMessages.length}`);
    });
    const agents = buildCustomerServiceAgents(model);

    await expect(
      Promise.all([
        agents.extractAgent.invoke({ input: '订单号 EC20240315001，昨天收到还没拆封，想退货' }),
        agents.policyCheckAgent.invoke({ extraction: '{"orderId":"EC20240315001"}' }),
        agents.riskReviewAgent.invoke({ input: '客服对话', extraction: '{"orderId":"EC20240315001"}' }),
        agents.qaAgent.invoke({ extraction: '{"orderId":"EC20240315001"}', policyCheck: '符合退货条件', riskReview: '无风险' }),
        agents.summaryAgent.invoke({
          input: '客服对话',
          extraction: '{"orderId":"EC20240315001"}',
          policyCheck: '符合退货条件',
          riskReview: '无风险',
          qa: 'Given-When-Then',
        }),
      ]),
    ).resolves.toEqual([
      'agent-output:1',
      'agent-output:2',
      'agent-output:3',
      'agent-output:4',
      'agent-output:5',
    ]);

    expect(Object.keys(agents)).toEqual(CUSTOMER_SERVICE_AGENT_NAMES);
    expect(seenMessages).toHaveLength(5);
    expect(seenMessages[0][0]).toBeInstanceOf(SystemMessage);
    expect(seenMessages[0][0].content).toContain('extractAgent');
    expect(seenMessages[0][1]).toBeInstanceOf(HumanMessage);
    expect(seenMessages[0][1].content).toContain('EC20240315001');
    expect(seenMessages[1][0].content).toContain('policyCheckAgent');
    expect(seenMessages[2][0].content).toContain('riskReviewAgent');
    expect(seenMessages[3][0].content).toContain('qaAgent');
    expect(seenMessages[4][0].content).toContain('summaryAgent');
  });
});
