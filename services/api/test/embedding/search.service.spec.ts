import { SearchService } from '../../src/embedding/search.service';

describe('SearchService', () => {
  it('searches only the current user documents with pgvector cosine distance', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: '退货政策',
          metadata: { source: 'policy' },
          distance: 0.25,
        },
      ]),
    };
    const embeddingService = {
      embedQuery: jest.fn(async () => [0.1, 0.2]),
    };
    const service = new SearchService(prisma as any, embeddingService as any);

    await expect(service.similaritySearch('怎么退货', 'user-1', 3)).resolves.toEqual([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        content: '退货政策',
        metadata: { source: 'policy' },
        score: 0.75,
      },
    ]);

    expect(embeddingService.embedQuery).toHaveBeenCalledWith('怎么退货');
    const [sql, vector, userId] =
      prisma.$queryRawUnsafe.mock.calls[0] as unknown[];
    expect(sql).toContain('c.embedding <=> $1::vector');
    expect(sql).toContain('JOIN "Document" d ON d.id = c."documentId"');
    expect(sql).toContain('WHERE d."userId" = $2');
    expect(sql).toContain('LIMIT 3');
    expect(vector).toBe('[0.1,0.2]');
    expect(userId).toBe('user-1');
  });
});
