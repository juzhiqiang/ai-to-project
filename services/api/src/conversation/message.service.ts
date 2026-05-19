import { Injectable } from '@nestjs/common';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { Prisma, type $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type MessageRole = $Enums.MessageRole;

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 写入一条消息 */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata !== undefined
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  /** 读取消息列表，按时间升序 */
  async getHistory(conversationId: string, limit?: number) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      ...(limit !== undefined ? { take: limit } : {}),
    });
  }

  /** 将消息历史转换为 LangChain BaseMessage 数组，供链式调用使用 */
  async getHistoryAsLangChainMessages(conversationId: string): Promise<BaseMessage[]> {
    const rows = await this.getHistory(conversationId);

    return rows.map((row) => {
      switch (row.role) {
        case 'system':
          return new SystemMessage(row.content);
        case 'ai':
          return new AIMessage(row.content);
        case 'tool':
          return new ToolMessage({ content: row.content, tool_call_id: '' });
        default:
          return new HumanMessage(row.content);
      }
    });
  }
}
