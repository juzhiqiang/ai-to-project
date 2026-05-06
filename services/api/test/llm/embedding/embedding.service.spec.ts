import { EmbeddingService, EMBEDDING_MODEL_NAME } from '../../../src/llm/embedding/embedding.service';

class FakeEmbeddings {
  public readonly embedQuery = jest.fn(async () => [0.1, 0.2, 0.3]);
  public readonly embedDocuments = jest.fn(async (documents: string[]) =>
    documents.map((_, index) => [index + 1, index + 2, index + 3]),
  );
}

describe('EmbeddingService', () => {
  it('uses the multilingual MiniLM model name for local embeddings', () => {
    expect(EMBEDDING_MODEL_NAME).toBe('Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  });

  it('delegates embedQuery and embedDocuments to the configured embeddings runtime', async () => {
    const embeddings = new FakeEmbeddings();
    const service = new EmbeddingService(embeddings);

    await expect(service.embedQuery('退货政策')).resolves.toEqual([0.1, 0.2, 0.3]);
    await expect(service.embedDocuments(['退货政策', '售后 FAQ'])).resolves.toEqual([
      [1, 2, 3],
      [2, 3, 4],
    ]);

    expect(embeddings.embedQuery).toHaveBeenCalledWith('退货政策');
    expect(embeddings.embedDocuments).toHaveBeenCalledWith(['退货政策', '售后 FAQ']);
  });
});
