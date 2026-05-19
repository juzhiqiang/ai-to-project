import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * 上传文件并保存元数据
   */
  async upload(userId: string, file: Express.Multer.File) {
    const timestamp = Date.now();
    // 确保文件名安全，去除特殊字符
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${safeOriginalName}`;

    // 构建基于用户ID的上传目录
    const uploadDir = path.join(process.cwd(), 'uploads', userId);
    const filePath = path.join(uploadDir, filename);

    try {
      // 确保目录存在
      await fs.mkdir(uploadDir, { recursive: true });
      // 写入物理文件
      await fs.writeFile(filePath, file.buffer);
    } catch (error) {
      throw new InternalServerErrorException('文件保存失败');
    }

    // 写入数据库
    return this.prisma.document.create({
      data: {
        userId,
        filename, // 实际保存的文件名
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        status: 'pending',
      },
    });
  }

  /**
   * 获取用户所有文档
   */
  async findByUser(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
  }

  /**
   * 获取单个文档（含权限校验）
   */
  async findById(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`文档 ${documentId} 不存在`);
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('无权访问该文档');
    }

    return document;
  }

  /**
   * 删除文档（含物理文件）
   */
  async delete(documentId: string, userId: string) {
    const document = await this.findById(documentId, userId);

    const filePath = path.join(process.cwd(), 'uploads', userId, document.filename);

    try {
      // 尝试删除物理文件，如果文件不存在则忽略错误
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch (error) {
      // 如果文件不存在，access或unlink会报错，这没关系，继续删除数据库记录即可
    }

    await this.prisma.document.delete({
      where: { id: documentId },
    });

    return { deleted: true, id: documentId };
  }
}
