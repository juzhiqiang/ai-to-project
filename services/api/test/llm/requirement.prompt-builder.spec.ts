import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { buildRequirementPromptTemplate } from '../../src/llm/requirement.prompt-builder';
import { REQUIREMENT_SYSTEM_PROMPT, REQUIREMENT_USER_TEMPLATE } from '../../src/llm/prompts/requirement.prompt';

const TEST_INPUT = '用户注册时必须绑定手机号，密码至少8位';

describe('buildRequirementPromptTemplate', () => {
  it('renders system and human messages with the requirement input', async () => {
    expect(REQUIREMENT_USER_TEMPLATE).toContain('{input}');

    const prompt = buildRequirementPromptTemplate();
    const messages = await prompt.formatMessages({ input: TEST_INPUT });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[0].content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(messages[1].content).toContain(TEST_INPUT);
    expect(messages[1].content).not.toContain('{input}');
  });
});
