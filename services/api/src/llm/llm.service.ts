import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { CHAT_MODEL_FACTORY, type ChatModelFactory, type ModelResponseLike } from './model.factory';
import { buildRequirementPromptTemplate } from './requirement.prompt-builder';
import { requirementChain, type RequirementChainModel } from './requirement.chain';
import { REQUIREMENT_SYSTEM_PROMPT } from './prompts/requirement.prompt';
import { basicTools } from './tools/basic.tools';

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

export interface RequirementToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface RequirementToolResult {
  id?: string;
  name: string;
  content: string;
  error?: boolean;
}

interface ToolBoundModel {
  invoke(messages: BaseMessage[]): Promise<ModelResponseLike>;
}

interface ToolBindableModel {
  bindTools(tools: typeof basicTools): ToolBoundModel;
}

interface InvokableRequirementTool {
  invoke(input: Record<string, unknown>): Promise<unknown>;
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

  async toolBind(body: RequirementPromptDto) {
    const response = await this.buildToolBoundModel().invoke(await this.buildRequirementMessages(body.input));

    return {
      content: normalizeContent(response.content),
      toolCalls: extractToolCalls(response),
    };
  }

  async toolLoop(body: RequirementPromptDto) {
    const model = this.buildToolBoundModel();
    const messages = await this.buildRequirementMessages(body.input);
    const firstResponse = await model.invoke(messages);
    const toolCalls = extractToolCalls(firstResponse);
    const toolResults = await Promise.all(toolCalls.map((item) => runBasicTool(item)));

    if (toolResults.length === 0) {
      return {
        content: normalizeContent(firstResponse.content),
        toolCalls,
        toolResults,
      };
    }

    const toolMessages = toolResults.map(
      (result) =>
        new ToolMessage({
          content: result.content,
          tool_call_id: result.id ?? result.name,
          status: result.error ? 'error' : 'success',
        }),
    );
    const finalResponse = await model.invoke([...messages, firstResponse as unknown as BaseMessage, ...toolMessages]);

    return {
      content: normalizeContent(finalResponse.content),
      toolCalls,
      toolResults,
    };
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

  private buildToolBoundModel(): ToolBoundModel {
    const model = this.createChatModel() as unknown as Partial<ToolBindableModel>;

    if (typeof model.bindTools !== 'function') {
      throw new Error('Chat model does not support LangChain tool binding');
    }

    return model.bindTools(basicTools);
  }
}

function toRenderedPromptMessage(message: BaseMessage): RenderedPromptMessage {
  return {
    type: message.type,
    content: normalizeContent(message.content),
  };
}

function extractToolCalls(response: unknown): RequirementToolCall[] {
  if (!isRecord(response) || !Array.isArray(response.tool_calls)) {
    return [];
  }

  return response.tool_calls
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.name === 'string')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      name: item.name as string,
      args: normalizeToolArgs(item.args),
    }));
}

async function runBasicTool(toolCall: RequirementToolCall): Promise<RequirementToolResult> {
  const selectedTool = basicTools.find((item) => item.name === toolCall.name);

  if (!selectedTool) {
    return {
      id: toolCall.id,
      name: toolCall.name,
      content: `Unknown tool: ${toolCall.name}`,
      error: true,
    };
  }

  try {
    const output = await (selectedTool as InvokableRequirementTool).invoke(toolCall.args);

    return {
      id: toolCall.id,
      name: toolCall.name,
      content: normalizeToolOutput(output),
    };
  } catch (error) {
    return {
      id: toolCall.id,
      name: toolCall.name,
      content: error instanceof Error ? error.message : String(error),
      error: true,
    };
  }
}

function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (isRecord(args)) {
    return args;
  }

  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown;

      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeToolOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  return JSON.stringify(output);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
