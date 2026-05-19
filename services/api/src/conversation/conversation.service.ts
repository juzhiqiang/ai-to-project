import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 会话管理服务
 *
 * 提供对 Conversation 实体的 CRUD 操作，核心职责：
 * - 为指定用户创建新会话
 * - 查询用户的全部会话列表（含聚合消息数）
 * - 按 ID 查询单条会话（含用户归属校验）
 * - 删除会话及其关联消息（级联删除由 Prisma schema 保证）
 *
 * 所有写操作均通过 PrismaService 与 PostgreSQL 交互。
 */
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * 创建新会话
   *
   * @param userId - 创建会话的用户 ID
   * @param title  - 可选的会话标题，若为空则默认为「新会话」
   * @returns 新创建的 Conversation 记录
   */
  async create(userId: string, title?: string) {
    return this.prisma.conversation.create({
      data: {
        userId,
        // 去除首尾空白后若仍为空，则使用默认标题
        title: title?.trim() || '新会话',
      },
    });
  }

  /**
   * 获取该用户的全部会话列表
   *
   * 返回字段：id、title、createdAt、updatedAt 以及消息数量（_count.messages）
   * 结果按 updatedAt 降序排列，最近活跃的会话排在最前面。
   *
   * @param userId - 要查询的用户 ID
   * @returns 会话列表（按最近更新时间倒序）
   */
  async findByUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        // 聚合查询：统计该会话下的消息条数
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * 按 ID 获取单个会话（含权限校验）
   *
   * 校验逻辑：
   * 1. 若会话不存在，抛出 404 NotFoundException
   * 2. 若会话归属的 userId 与传入 userId 不一致，抛出 403 ForbiddenException
   *
   * @param conversationId - 要查询的会话 ID
   * @param userId         - 当前操作用户的 ID，用于归属验证
   * @returns 会话记录
   * @throws NotFoundException  会话不存在时抛出
   * @throws ForbiddenException 用户无权访问该会话时抛出
   */
  async findById(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`会话 ${conversationId} 不存在`);
    }

    // 校验会话归属，防止越权访问
    if (conversation.userId !== userId) {
      throw new ForbiddenException('无权访问该会话');
    }

    return conversation;
  }

  /**
   * 删除会话（含权限校验，关联消息级联删除）
   *
   * 先调用 findById 完成存在性与归属校验，校验通过后再执行删除。
   * 关联的 Message 记录由 Prisma schema 中的 onDelete: Cascade 自动删除。
   *
   * @param conversationId - 要删除的会话 ID
   * @param userId         - 当前操作用户的 ID，用于归属验证
   * @returns 包含 deleted 标志和被删除会话 ID 的对象
   * @throws NotFoundException  会话不存在时抛出
   * @throws ForbiddenException 用户无权操作该会话时抛出
   */
  async delete(conversationId: string, userId: string) {
    // 复用 findById 的存在性与权限校验
    await this.findById(conversationId, userId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { deleted: true, id: conversationId };
  }
}
