import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { PrismaClient } from '@prisma/client';

/**
 * 基于 PostgreSQL（Prisma Message 表）的 LangChain ChatMessageHistory 实现。
 * 与 RunnableWithMessageHistory 兼容：getMessageHistory 传入此实例后，
 * 每轮对话的 human / ai 消息均自动落库。
 */
export class DbChatMessageHistory extends BaseChatMessageHistory {
  lc_namespace = ['langchain', 'stores', 'message', 'prisma'];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly conversationId: string,
  ) {
    super();
  }

  async getMessages(): Promise<BaseMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId: this.conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(rowToLangChainMessage);
  }

  async addMessage(message: BaseMessage): Promise<void> {
    await this.prisma.message.create({
      data: {
        conversationId: this.conversationId,
        role: langChainTypeToRole(message.getType()),
        content: normalizeMessageContent(message.content),
      },
    });
  }

  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage(message));
  }

  async addAIMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage(message));
  }

  async addMessages(messages: BaseMessage[]): Promise<void> {
    for (const message of messages) {
      await this.addMessage(message);
    }
  }

  async clear(): Promise<void> {
    await this.prisma.message.deleteMany({
      where: { conversationId: this.conversationId },
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function langChainTypeToRole(type: string): 'system' | 'human' | 'ai' | 'tool' {
  switch (type) {
    case 'system':
      return 'system';
    case 'human':
      return 'human';
    case 'ai':
      return 'ai';
    case 'tool':
      return 'tool';
    default:
      return 'human';
  }
}

function rowToLangChainMessage(row: {
  role: string;
  content: string;
  metadata
}): BaseMessage {
  switch (row.role) {
    case 'system':
      return new SystemMessage(row.content);
    case 'ai':
      return new AIMessage(row.content);
    case 'tool':
      return new ToolMessage({ content: row.content, tool_call_id: (row.metadata as any)?.tool_call_id ?? '' });
    default:
      return new HumanMessage(row.content);
  }
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String(item.text);
        return '';
      })
      .join('');
  }
  return String(content ?? '');
}
