import type { BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { ChatPromptValueInterface } from '@langchain/core/prompt_values';
import type { RunnableLike } from '@langchain/core/runnables';
import { buildRequirementPromptTemplate } from './requirement.prompt-builder';

export interface RequirementChainInput {
  input: string;
}

export type RequirementChainModel = RunnableLike<ChatPromptValueInterface, string | BaseMessage>;

export function requirementChain(model: RequirementChainModel) {
  const requirementPrompt = buildRequirementPromptTemplate();

  return requirementPrompt.pipe(model).pipe(new StringOutputParser());
}
