import { ChunkService } from '../../src/document/chunk.service';
import { ParserFactory } from '../../src/document/parsers/parser.factory';

describe('ChunkService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores parsed chunks with raw SQL before embedding them', async () => {
    jest.spyOn(ParserFactory, 'getParser').mockReturnValue({
      parse: jest.fn(async () => '退货政策说明'),
    });

    const prisma = {
      document: {
        findUnique: jest.fn(async () => ({
          id: 'doc-1',
          userId: 'user-1',
          filename: 'policy.txt',
          mimeType: 'text/plain',
        })),
        update: jest.fn(async () => undefined),
      },
      documentChunk: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    const embeddingService = {
      embedChunks: jest.fn(async () => ({ embedded: 1 })),
    };

    const service = new ChunkService(prisma as any, embeddingService as any);

    await expect(service.chunkDocument('doc-1', 'user-1')).resolves.toEqual({
      processed: true,
      chunksCount: 1,
    });

    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
    });
    const insertCall = prisma.$executeRawUnsafe.mock.calls[0] as unknown[];
    expect(insertCall[0]).toContain('INSERT INTO "DocumentChunk"');
    expect(insertCall[1]).toEqual(expect.any(String));
    expect(insertCall[2]).toBe('doc-1');
    expect(insertCall[3]).toBe('退货政策说明');
    expect(insertCall[4]).toBe(0);
    expect(JSON.parse(insertCall[5] as string)).toEqual({
      loc: { lines: { from: 1, to: 1 } },
    });
    expect(embeddingService.embedChunks).toHaveBeenCalledWith('doc-1');
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: {
        chunkCount: 1,
        status: 'completed',
      },
    });
  });
});
