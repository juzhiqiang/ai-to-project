import {
  EmbeddingService,
  EMBEDDING_MODEL_NAME,
  BGE_QUERY_PREFIX,
} from '../../../src/llm/embedding/embedding.service';

class FakeEmbeddings {
  public readonly embedQuery = jest.fn(async () => [0.1, 0.2, 0.3]);
  public readonly embedDocuments = jest.fn(async (documents: string[]) =>
    documents.map((_, index) => [index + 1, index + 2, index + 3]),
  );
}

describe('EmbeddingService', () => {
  it('uses the bge-small-zh-v1.5 model name for local embeddings', () => {
    expect(EMBEDDING_MODEL_NAME).toBe('Xenova/bge-small-zh-v1.5');
  });

  it('delegates embedQuery and embedDocuments to the configured embeddings runtime', async () => {
    const embeddings = new FakeEmbeddings();
    const service = new EmbeddingService(embeddings);

    await expect(service.embedQuery('退货政策')).resolves.toEqual([0.1, 0.2, 0.3]);
    await expect(service.embedDocuments(['退货政策', '售后 FAQ'])).resolves.toEqual([
      [1, 2, 3],
      [2, 3, 4],
    ]);

    // query 侧加 bge 检索指令前缀，passage 侧不加
    expect(embeddings.embedQuery).toHaveBeenCalledWith(`${BGE_QUERY_PREFIX}退货政策`);
    expect(embeddings.embedDocuments).toHaveBeenCalledWith(['退货政策', '售后 FAQ']);
  });
});
