import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建测试用户
   * @param id 自定义的用户ID（如 'user-001'）
   * @param email 测试邮箱（需唯一）
   * @param name 用户昵称
   */
  async createUser(id: string, email: string, name?: string) {
    return this.prisma.user.create({
      data: {
        id, // 这里允许手动指定 ID 方便测试，真实场景通常由数据库自动生成或随机生成
        email,
        name,
      },
    });
  }
}
