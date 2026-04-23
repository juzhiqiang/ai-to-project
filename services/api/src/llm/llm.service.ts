import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { CHAT_MODEL_FACTORY, type ChatModelFactory, type ModelResponseLike } from './model.factory';

const SYSTEM_ROLE = '需求结构化抽取助手';

export interface InvokeLlmDto {
  prompt: string;
}

export interface BatchLlmDto {
  prompts: string[];
}

@Injectable()
export class LlmService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) {}

  async invoke(body: InvokeLlmDto) {
    const response = await this.createChatModel().invoke(this.buildMessages(body.prompt));
    return { content: normalizeContent(response.content) };
  }

  async stream(body: InvokeLlmDto, response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');

    const stream = await this.createChatModel().stream(this.buildMessages(body.prompt));

    for await (const chunk of stream) {
      response.write(`data: ${JSON.stringify({ content: normalizeContent(chunk.content) })}\n\n`);
    }

    response.end();
  }

  async batch(body: BatchLlmDto) {
    const responses = await this.createChatModel().batch(body.prompts.map((prompt) => this.buildMessages(prompt)));
    return {
      results: responses.map((item) => normalizeContent(item.content)),
    };
  }

  private buildMessages(prompt: string): BaseMessage[] {
    return [new SystemMessage(SYSTEM_ROLE), new HumanMessage(prompt)];
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }

  return String(content ?? '');
}

export { SYSTEM_ROLE, normalizeContent, type ModelResponseLike };
