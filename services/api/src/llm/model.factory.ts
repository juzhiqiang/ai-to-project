import type { BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { getApiKeys } from '../config/get-api-keys';
import { loadLangChainConfig } from '../config/load-langchain-config';

export interface ModelResponseLike {
  content: unknown;
}

export interface ChatModelLike {
  invoke(messages: BaseMessage[]): Promise<ModelResponseLike>;
  batch(messageBatches: BaseMessage[][]): Promise<ModelResponseLike[]>;
  stream(messages: BaseMessage[]): Promise<AsyncIterable<ModelResponseLike>> | AsyncIterable<ModelResponseLike>;
}

export type ChatModelFactory = () => ChatModelLike;

export const CHAT_MODEL_FACTORY = Symbol('CHAT_MODEL_FACTORY');

export function createChatModel(): ChatModelLike {
  const config = loadLangChainConfig();
  const apiKeys = getApiKeys();

  return new ChatOpenAI({
    model: config.llm.model,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
    apiKey: apiKeys.openAiApiKey,
    configuration: {
      baseURL: apiKeys.openAiBaseUrl,
    },
  });
}
