import { Inject, Injectable } from '@nestjs/common';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RequirementResultSchema, type RequirementResult } from '@repo/contracts';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from './model.factory';
import { REQUIREMENT_SYSTEM_PROMPT, REQUIREMENT_USER_TEMPLATE } from './prompts/requirement.prompt';

interface StructuredRequirementModel {
  withStructuredOutput(schema: typeof RequirementResultSchema): {
    invoke(messages: BaseMessage[]): Promise<RequirementResult>;
  };
}

@Injectable()
export class RequirementService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) { }

  private prompt = ChatPromptTemplate.fromMessages([
    ['system', REQUIREMENT_SYSTEM_PROMPT],
    ['human', REQUIREMENT_USER_TEMPLATE],
  ]);

  async extract(input: string): Promise<RequirementResult> {

    const messages = await this.prompt.formatMessages({ input });
    const model = this.createChatModel() as unknown as StructuredRequirementModel;
    const structuredModel = model.withStructuredOutput(RequirementResultSchema);
    const result = await structuredModel.invoke(messages);

    return RequirementResultSchema.parse(result);
  }
}
