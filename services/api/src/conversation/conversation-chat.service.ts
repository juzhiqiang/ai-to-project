import { Inject, Injectable } from '@nestjs/common';
import type { ChatPromptValueInterface } from '@langchain/core/prompt_values';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { type BaseMessage } from '@langchain/core/messages';
import { type Runnable, RunnableWithMessageHistory } from '@langchain/core/runnables';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../llm/model.factory';
import { normalizeContent } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { DbChatMessageHistory } from './db-chat-history';

/**
 * 对话聊天接口返回结果
 */
export interface ConversationChatResult {
  /** 当前会话的唯一标识符 */
  conversationId: string;
  /** 模型生成的回复内容 */
  content: string;
}

/**
 * 对话聊天服务
 *
 * 负责处理与 LLM 的实际聊天交互，具体功能包括：
 * - 构建包含历史消息占位符的提示词模板
 * - 将提示词与聊天模型组合成可执行链（Runnable Chain）
 * - 通过 RunnableWithMessageHistory 自动注入会话历史
 * - 将对话历史持久化到 PostgreSQL 数据库（via PrismaService + DbChatMessageHistory）
 */
@Injectable()
export class ConversationChatService {
  /**
   * 提示词模板
   *
   * 结构：
   * 1. `history`（MessagesPlaceholder）：运行时注入的历史消息列表
   * 2. `human`：当前用户的输入（对应 invoke 时传入的 `input` 字段）
   */
  private readonly prompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder('history'),
    ['human', '{input}'],
  ]);

  constructor(
    /** 通过工厂 Token 注入聊天模型创建函数 */
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
    /** Prisma 数据库服务，用于持久化消息历史 */
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 发送一条聊天消息并返回模型的回复
   *
   * @param conversationId - 会话 ID，用于关联历史消息记录
   * @param input - 用户本次的输入文本
   * @returns 包含 conversationId 和模型回复内容的结果对象
   */
  async chat(conversationId: string, input: string): Promise<ConversationChatResult> {
    // 构建带历史记忆的对话链
    const chain = this.buildChain(conversationId);

    // 执行链：传入当前用户输入，并通过 configurable.sessionId 指定会话
    const response = await chain.invoke(
      { input },
      { configurable: { sessionId: conversationId } },
    );

    return {
      conversationId,
      // 将模型返回值（BaseMessage | string 等）统一归一化为纯文本字符串
      content: normalizeContent(response),
    };
  }

  /**
   * 构建带消息历史的可执行链
   *
   * 流程：
   * 1. 通过工厂函数创建聊天模型实例
   * 2. 将提示词模板与模型串联（prompt → model）
   * 3. 包装为 RunnableWithMessageHistory，使其在每次调用时自动：
   *    - 从数据库加载该会话的历史消息（getMessageHistory）
   *    - 将历史注入 `history` 占位符
   *    - 将新消息追加到数据库
   *
   * @param conversationId - 用于从数据库中检索对应会话历史的 ID
   */
  private buildChain(conversationId: string) {
    // 创建聊天模型，强转为通用 Runnable 接口以兼容类型系统
    const model = this.createChatModel() as unknown as Runnable<ChatPromptValueInterface, BaseMessage>;
    // 组合提示词与模型，形成基础对话链
    const runnable = this.prompt.pipe(model);

    // 用消息历史包装器封装基础链，实现自动历史读写
    return new RunnableWithMessageHistory({
      runnable,
      // 每次调用时创建对应会话的数据库历史实例
      getMessageHistory: () => new DbChatMessageHistory(this.prisma, conversationId),
      // 指定用户输入在 invoke 参数中的 key
      inputMessagesKey: 'input',
      // 指定历史消息在提示词模板中的 key
      historyMessagesKey: 'history',
    });
  }
}
