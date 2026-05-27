const mockEmbeddingsRuntime = {
  embedQuery: jest.fn(async () => [0.1, 0.2]),
  embedDocuments: jest.fn(async () => [
    [0.1, 0.2],
    [0.3, 0.4],
  ]),
};

jest.mock('@langchain/community/embeddings/huggingface_transformers', () => ({
  HuggingFaceTransformersEmbeddings: jest.fn(() => mockEmbeddingsRuntime),
}));

import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import {
  EMBEDDING_MODEL_NAME,
  EmbeddingService,
} from '../../src/embedding/embedding.service';

describe('EmbeddingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the multilingual MiniLM model for pgvector embeddings', () => {
    new EmbeddingService({} as any);

    expect(HuggingFaceTransformersEmbeddings).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL_NAME,
    });
  });

  it('embeds document chunks and writes vectors through raw SQL', async () => {
    const prisma = {
      documentChunk: {
        findMany: jest.fn(async () => [
          { id: 'chunk-1', content: '退货政策' },
          { id: 'chunk-2', content: '退款说明' },
        ]),
      },
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    const service = new EmbeddingService(prisma as any);

    await expect(service.embedChunks('doc-1')).resolves.toEqual({ embedded: 2 });

    expect(prisma.documentChunk.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      select: { id: true, content: true },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(mockEmbeddingsRuntime.embedDocuments).toHaveBeenCalledWith([
      '退货政策',
      '退款说明',
    ]);
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2',
      '[0.1,0.2]',
      'chunk-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2',
      '[0.3,0.4]',
      'chunk-2',
    );
  });
});
