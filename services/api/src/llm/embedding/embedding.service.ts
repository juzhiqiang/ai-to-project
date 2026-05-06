import { Inject, Injectable, Optional } from '@nestjs/common';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

export const EMBEDDING_MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
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
    return this.embeddings.embedQuery(text);
  }

  embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(documents);
  }
}
