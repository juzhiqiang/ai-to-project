import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RequirementResultSchema } from '@repo/contracts';
import { RequirementService } from '../../src/llm/requirement.service';
import { REQUIREMENT_SYSTEM_PROMPT } from '../../src/llm/prompts/requirement.prompt';
import type { ChatModelFactory } from '../../src/llm/model.factory';

const TEST_INPUT = '用户注册时必须绑定手机号，密码至少8位';
const STRUCTURED_RESULT = {
  action: ['绑定手机号'],
  constraints: ['必须绑定手机号', '密码至少8位'],
  entities: ['用户注册', '手机号', '密码'],
};

class FakeStructuredModel {
  constructor(private readonly structuredResult: unknown = STRUCTURED_RESULT) {}

  public readonly invokeStructured = jest.fn(async () => this.structuredResult);

  public readonly withStructuredOutput = jest.fn(() => ({
    invoke: this.invokeStructured,
  }));
}

describe('RequirementService', () => {
  it('extracts requirement fields through model structured output', async () => {
    const model = new FakeStructuredModel();
    const service = new RequirementService((() => model) as unknown as ChatModelFactory);

    const result = await service.extract(TEST_INPUT);

    expect(result).toEqual(STRUCTURED_RESULT);
    expect(RequirementResultSchema.parse(result)).toEqual(STRUCTURED_RESULT);
    expect(model.withStructuredOutput).toHaveBeenCalledWith(RequirementResultSchema);

    const [messages] = model.invokeStructured.mock.calls[0] as unknown as [BaseMessage[]];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[0].content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(messages[1].content).toContain(TEST_INPUT);
    expect(messages.map((message) => message.content).join('\n')).toMatch(/json/i);
  });

  it('normalizes a string action returned by structured output', async () => {
    const model = new FakeStructuredModel({
      action: '绑定手机号',
      constraints: ['必须绑定手机号', '密码至少8位'],
      entities: ['用户注册', '手机号', '密码'],
    });
    const service = new RequirementService((() => model) as unknown as ChatModelFactory);

    await expect(service.extract(TEST_INPUT)).resolves.toEqual(STRUCTURED_RESULT);
  });
});
