import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ParserFactory } from './parsers/parser.factory';
import { EmbeddingService } from '../embedding/embedding.service';
import * as path from 'path';

@Injectable()
export class ChunkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
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

      // 批量写入文本块
      await this.prisma.documentChunk.createMany({
        data: chunkedDocs.map((chunk, index) => ({
          documentId,
          content: chunk.pageContent,
          chunkIndex: index,
          metadata: chunk.metadata as any,
        })),
      });

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

      return { processed: true, chunksCount: chunkedDocs.length };
    } catch (error) {
      // 失败时更新状态
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
      console.error('Chunk Document Error:', error);
      throw new InternalServerErrorException('解析与分块失败');
    }
  }
}
