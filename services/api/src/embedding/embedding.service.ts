import { Injectable, NotFoundException } from '@nestjs/common';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { PrismaService } from '../prisma/prisma.service';

export const EMBEDDING_MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
// bge-v1.5 检索规范：query 侧加指令前缀，passage（文档）侧不加，可显著提升中文检索相关性。
export const BGE_QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';
const EMBED_BATCH_SIZE = 16;

@Injectable()
export class EmbeddingService {
  private readonly embeddings: EmbeddingsInterface;

  constructor(private readonly prisma: PrismaService) {
    this.embeddings = new HuggingFaceTransformersEmbeddings({
      model: EMBEDDING_MODEL_NAME,
    });
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(BGE_QUERY_PREFIX + text);
  }

  async embedChunks(documentId: string): Promise<{ embedded: number }> {
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      select: { id: true, content: true },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      throw new NotFoundException(`文档 ${documentId} 没有可向量化的分块`);
    }

    let embedded = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await this.embeddings.embedDocuments(
        batch.map((chunk) => chunk.content),
      );

      await Promise.all(
        batch.map((chunk, idx) =>
          this.prisma.$executeRawUnsafe(
            `UPDATE "DocumentChunk" SET embedding = $1::vector, "modelName" = $2 WHERE id = $3`,
            toVectorLiteral(vectors[idx]),
            EMBEDDING_MODEL_NAME,
            chunk.id,
          ),
        ),
      );

      embedded += batch.length;
    }

    return { embedded };
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
