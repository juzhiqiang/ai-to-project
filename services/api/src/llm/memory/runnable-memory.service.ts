import { Inject, Injectable } from '@nestjs/common';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage, type BaseMessage, trimMessages } from '@langchain/core/messages';
import type { ChatPromptValueInterface } from '@langchain/core/prompt_values';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Runnable, RunnableLambda, RunnableWithMessageHistory } from '@langchain/core/runnables';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../model.factory';

export interface MemoryChatResult {
  sessionId: string;
  content: string;
}

export interface MemoryMessage {
  type: string;
  content: string;
}

interface MemoryChainInput {
  input: string;
  history?: BaseMessage[];
}

const CUSTOMER_SERVICE_SYSTEM_PROMPT = [
  '你是电商客服系统助手。',
  '你需要结合当前会话上下文，帮助用户处理退货、订单和售后问题。',
  '如果缺少订单号或关键信息，先要求用户补充；如果信息充分，给出明确判断和下一步建议。',
].join('\n');

@Injectable()
export class RunnableMemoryService {
  // 关键性质：当前记忆是进程内、易失的；API 进程重启后会丢失全部会话。
  // 关键性质：sessionId 是会话隔离边界，不同 sessionId 不能共享历史消息。
  private readonly histories = new Map<string, InMemoryChatMessageHistory>();

  // 关键性质：history 会插入到新一轮用户输入之前，模型会先看到历史轮次。
  private readonly prompt = ChatPromptTemplate.fromMessages([
    ['system', CUSTOMER_SERVICE_SYSTEM_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{input}'],
  ]);

  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) { }

  async chat(sessionId: string, input: string): Promise<MemoryChatResult> {
    // 关键性质：RunnableWithMessageHistory 会自动追加本轮 human 输入和 AI 输出。
    // 不要在这里调用 appendMessage()，否则每轮对话会被重复写入历史。
    const response = await this.buildChain().invoke(
      { input },
      {
        configurable: {
          sessionId,
        },
      },
    );

    return {
      sessionId,
      content: normalizeContent(response),
    };
  }

  async getHistory(sessionId: string): Promise<MemoryMessage[]> {
    const messages = await this.getMessageHistory(sessionId).getMessages();

    return messages.map(toMemoryMessage);
  }

  async appendMessage(sessionId: string, human: string, ai: string): Promise<void> {
    // 关键性质：appendMessage() 只用于在实时对话链路之外预置或导入历史。
    await this.getMessageHistory(sessionId).addMessages([new HumanMessage(human), new AIMessage(ai)]);
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.getMessageHistory(sessionId).clear();
  }

  private getMessageHistory(sessionId: string) {
    // 关键性质：getMessageHistory() 故意采用懒创建，未知 session 会从空历史开始。
    const existingHistory = this.histories.get(sessionId);

    if (existingHistory) {
      return existingHistory;
    }

    const history = new InMemoryChatMessageHistory();
    this.histories.set(sessionId, history);

    return history;
  }

  private buildChain() {
    // 关键性质：裁剪只发生在本次注入模型的 history 上。
    // 已存储的完整会话历史会保留，直到显式调用 clearSession()。
    const trimHistory = RunnableLambda.from(async (input: MemoryChainInput) => ({
      ...input,
      history: await this.trimHistory(input.history ?? []),
    }));
    const model = this.createChatModel() as unknown as Runnable<ChatPromptValueInterface, BaseMessage>;
    const runnable = trimHistory.pipe(this.prompt).pipe(model);

    return new RunnableWithMessageHistory({
      runnable,
      getMessageHistory: (sessionId: string) => this.getMessageHistory(sessionId),
      // 关键性质：input 表示本轮用户输入，history 表示此前的多轮上下文。
      inputMessagesKey: 'input',
      historyMessagesKey: 'history',
    });
  }

  private trimHistory(messages: BaseMessage[]) {
    // 关键性质：strategy="last" 会在预算内保留最近上下文。
    // 当前 counter 是确定性的消息数量近似；接入模型 token 计数器后可替换。
    return trimMessages(messages, {
      maxTokens: 2000,
      strategy: 'last',
      tokenCounter: countMessagesApproximately,
      includeSystem: true,
      allowPartial: false,
    });
  }
}

function countMessagesApproximately(messages: BaseMessage[]) {
  return messages.length;
}

function toMemoryMessage(message: BaseMessage): MemoryMessage {
  return {
    type: message.getType(),
    content: normalizeContent(message),
  };
}

function normalizeContent(value: unknown): string {
  if (value instanceof AIMessage || value instanceof HumanMessage) {
    return normalizeContent(value.content);
  }

  if (isMessageLike(value)) {
    return normalizeContent(value.content);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeContent).join('');
  }

  if (isTextBlock(value)) {
    return value.text;
  }

  return String(value ?? '');
}

function isMessageLike(value: unknown): value is { content: unknown } {
  return Boolean(value) && typeof value === 'object' && 'content' in value;
}

function isTextBlock(value: unknown): value is { text: string } {
  return Boolean(value) && typeof value === 'object' && 'text' in value && typeof value.text === 'string';
}
