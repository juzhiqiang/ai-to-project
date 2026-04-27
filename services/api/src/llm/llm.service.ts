import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { CHAT_MODEL_FACTORY, type ChatModelFactory, type ModelResponseLike } from './model.factory';
import { buildRequirementPromptTemplate } from './requirement.prompt-builder';
import { requirementChain, type RequirementChainModel } from './requirement.chain';
import { REQUIREMENT_SYSTEM_PROMPT } from './prompts/requirement.prompt';

const SYSTEM_ROLE = REQUIREMENT_SYSTEM_PROMPT;

export interface InvokeLlmDto {
  prompt: string;
}

export interface BatchLlmDto {
  prompts: string[];
}

export interface RequirementPromptDto {
  input: string;
}

export interface RequirementChainBatchDto {
  inputs: string[];
}

export interface RenderedPromptMessage {
  type: string;
  content: string;
}

@Injectable()
export class LlmService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) {}

  async invoke(body: InvokeLlmDto) {
    const response = await this.createChatModel().invoke(await this.buildRequirementMessages(body.prompt));
    return { content: normalizeContent(response.content) };
  }

  async promptPreview(body: RequirementPromptDto) {
    return {
      messages: (await this.buildRequirementMessages(body.input)).map(toRenderedPromptMessage),
    };
  }

  async promptToModel(body: RequirementPromptDto) {
    const response = await this.createChatModel().invoke(await this.buildRequirementMessages(body.input));
    return { content: normalizeContent(response.content) };
  }

  async chainInvoke(body: RequirementPromptDto) {
    const content = await this.buildRequirementChain().invoke({ input: body.input });
    return { content };
  }

  async chainStream(body: RequirementPromptDto, response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');

    const stream = await this.buildRequirementChain().stream({ input: body.input });

    for await (const chunk of stream) {
      response.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    response.end();
  }

  async chainBatch(body: RequirementChainBatchDto) {
    const results = await this.buildRequirementChain().batch(body.inputs.map((input) => ({ input })));
    return { results };
  }

  async stream(body: InvokeLlmDto, response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');

    const stream = await this.createChatModel().stream(this.buildMessages(`请逐步分析并输出结构化抽取结果：\n${body.prompt}`));

    for await (const chunk of stream) {
      Logger.log(chunk, 'chunk');
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

  private buildRequirementMessages(input: string): Promise<BaseMessage[]> {
    return buildRequirementPromptTemplate().formatMessages({ input });
  }

  private buildRequirementChain() {
    return requirementChain(this.createChatModel() as unknown as RequirementChainModel);
  }
}

function toRenderedPromptMessage(message: BaseMessage): RenderedPromptMessage {
  return {
    type: message.type,
    content: normalizeContent(message.content),
  };
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
