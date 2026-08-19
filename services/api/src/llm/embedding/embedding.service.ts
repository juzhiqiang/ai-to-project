import { Inject, Injectable, Optional } from '@nestjs/common';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

export const EMBEDDING_MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
// bge-v1.5 检索规范：query 侧加指令前缀，passage（文档）侧不加。
export const BGE_QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';
export const EMBEDDINGS_RUNTIME = Symbol('EMBEDDINGS_RUNTIME');

@Injectable()
export class EmbeddingService implements EmbeddingsInterface {
  private readonly embeddings: EmbeddingsInterface;

  constructor(
    @Optional()
    @Inject(EMBEDDINGS_RUNTIME)
    embeddings?: EmbeddingsInterface,
  ) {
    this.embeddings =
      embeddings ??
      new HuggingFaceTransformersEmbeddings({
        model: EMBEDDING_MODEL_NAME,
      });
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(BGE_QUERY_PREFIX + text);
  }

  embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(documents);
  }
}
