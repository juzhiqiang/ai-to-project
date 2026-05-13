import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { CHAT_MODEL_FACTORY, type ChatModelFactory, type ModelResponseLike } from '../model.factory';
import { businessTools, writeWorkspaceFileTool } from '../tools/business.tools';

const MAX_TOOL_ITERATIONS = 5;

export interface FileToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface FileToolResult {
  id?: string;
  name: string;
  content: string;
  error?: boolean;
}

export interface FileChatResult {
  content: string;
  toolCalls: FileToolCall[];
  toolResults: FileToolResult[];
}

export interface FileWriteResult {
  path: string;
  written: boolean;
}

interface ToolBoundModel {
  invoke(messages: BaseMessage[]): Promise<ModelResponseLike>;
}

interface ToolBindableModel {
  bindTools(tools: typeof businessTools): ToolBoundModel;
}

interface InvokableBusinessTool {
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

@Injectable()
export class FilesystemService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) {}

  async fileChat(input: string): Promise<FileChatResult> {
    const model = this.buildToolBoundModel();
    const messages: BaseMessage[] = [
      new SystemMessage(
        [
          '你是电商客服工单助手，可以按需调用工具读取订单、商品、政策，并将结论写入工单报告。',
          'workspace 内路径都使用相对路径，不要带 workspace/ 前缀。',
          '写报告前应尽量读取足够的订单、商品或政策信息。',
        ].join('\n'),
      ),
      new HumanMessage(input),
    ];
    const allToolCalls: FileToolCall[] = [];
    const allToolResults: FileToolResult[] = [];
    let response = await model.invoke(messages);

    for (let index = 0; index < MAX_TOOL_ITERATIONS; index += 1) {
      const toolCalls = extractToolCalls(response);

      if (toolCalls.length === 0) {
        return {
          content: normalizeContent(response.content),
          toolCalls: allToolCalls,
          toolResults: allToolResults,
        };
      }

      const toolResults = await Promise.all(toolCalls.map((item) => runBusinessTool(item)));
      allToolCalls.push(...toolCalls);
      allToolResults.push(...toolResults);
      messages.push(response as unknown as BaseMessage, ...toolResults.map(toToolMessage));
      response = await model.invoke(messages);
    }

    return {
      content: normalizeContent(response.content),
      toolCalls: allToolCalls,
      toolResults: allToolResults,
    };
  }

  async writeFile(path: string, content: string): Promise<FileWriteResult> {
    const output = await (writeWorkspaceFileTool as InvokableBusinessTool).invoke({ path, content });
    const parsed = JSON.parse(normalizeToolOutput(output)) as FileWriteResult;

    return parsed;
  }

  private buildToolBoundModel(): ToolBoundModel {
    const model = this.createChatModel() as unknown as Partial<ToolBindableModel>;

    if (typeof model.bindTools !== 'function') {
      throw new Error('Chat model does not support LangChain tool binding');
    }

    return model.bindTools(businessTools);
  }
}

async function runBusinessTool(toolCall: FileToolCall): Promise<FileToolResult> {
  const selectedTool = businessTools.find((item) => item.name === toolCall.name);

  if (!selectedTool) {
    return {
      id: toolCall.id,
      name: toolCall.name,
      content: `Unknown tool: ${toolCall.name}`,
      error: true,
    };
  }

  try {
    const output = await (selectedTool as InvokableBusinessTool).invoke(toolCall.args);

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

function toToolMessage(result: FileToolResult) {
  return new ToolMessage({
    content: result.content,
    tool_call_id: result.id ?? result.name,
    status: result.error ? 'error' : 'success',
  });
}

function extractToolCalls(response: unknown): FileToolCall[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
