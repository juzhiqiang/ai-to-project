import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { requirementChain } from '../../src/llm/requirement.chain';
import { REQUIREMENT_SYSTEM_PROMPT } from '../../src/llm/prompts/requirement.prompt';

const TEST_INPUT = '用户注册时必须绑定手机号，密码至少8位';

describe('requirementChain', () => {
  it('pipes the requirement prompt through the model and string output parser', async () => {
    const seenMessages: BaseMessage[][] = [];
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const messages = promptValue.toChatMessages();
      seenMessages.push(messages);

      return new AIMessage(`parsed:${messages.length}`);
    });

    const result = await requirementChain(model).invoke({ input: TEST_INPUT });

    expect(result).toBe('parsed:2');
    expect(seenMessages[0][0]).toBeInstanceOf(SystemMessage);
    expect(seenMessages[0][0].content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect(seenMessages[0][1]).toBeInstanceOf(HumanMessage);
    expect(seenMessages[0][1].content).toContain(TEST_INPUT);
  });
});
