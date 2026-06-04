import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ParserFactory } from './parsers/parser.factory';
import { EmbeddingService } from '../embedding/embedding.service';
import { SseService } from '../sse/sse.service';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class ChunkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly sseService: SseService,
  ) {}

  async chunkDocument(documentId: string, userId: string) {
    // 1. 获取文档记录
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`文档 ${documentId} 不存在`);
    }

    if (document.userId !== userId) {
      throw new NotFoundException(`无权访问此文档`);
    }

    // 更新状态为 processing
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    // 推送「处理中」事件
    this.sseService.emit(userId, {
      taskType: 'document_vectorize',
      taskId: documentId,
      status: 'processing',
      message: '文档向量化处理中',
    });

    try {
      // 2. 读取文件内容 & 调用解析器提取纯文本
      const filePath = path.join(process.cwd(), 'uploads', document.userId, document.filename);
      const parser = ParserFactory.getParser(document.mimeType);
      const text = await parser.parse(filePath);

      // 3. 用 TextSplitter 切分
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
      });

      const chunkedDocs = await splitter.createDocuments([text]);

      // 4. 将 chunks 写入 DocumentChunk 表
      // 插入前先清理可能已有的旧 chunk
      await this.prisma.documentChunk.deleteMany({
        where: { documentId: documentId },
      });

      await Promise.all(
        chunkedDocs.map((chunk, index) =>
          this.prisma.$executeRawUnsafe(
            `
            INSERT INTO "DocumentChunk" (
              "id",
              "documentId",
              "content",
              "chunkIndex",
              "metadata"
            )
            VALUES ($1, $2, $3, $4, $5::jsonb)
            `,
            randomUUID(),
            documentId,
            chunk.pageContent,
            index,
            JSON.stringify(chunk.metadata ?? {}),
          ),
        ),
      );

      // 5. 向量化所有 chunks 并写入 embedding 字段
      await this.embeddingService.embedChunks(documentId);

      // 6. 更新 Document 的 chunkCount 和 status
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          chunkCount: chunkedDocs.length,
          status: 'completed',
        },
      });

      // 推送「完成」事件
      this.sseService.emit(userId, {
        taskType: 'document_vectorize',
        taskId: documentId,
        status: 'done',
        message: '文档向量化完成',
        metadata: { chunkCount: chunkedDocs.length },
      });

      return { processed: true, chunksCount: chunkedDocs.length };
    } catch (error) {
      // 失败时更新状态
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });

      // 推送「失败」事件
      this.sseService.emit(userId, {
        taskType: 'document_vectorize',
        taskId: documentId,
        status: 'error',
        message: error instanceof Error ? error.message : '解析与分块失败',
      });

      console.error('Chunk Document Error:', error);
      throw new InternalServerErrorException('解析与分块失败');
    }
  }
}
