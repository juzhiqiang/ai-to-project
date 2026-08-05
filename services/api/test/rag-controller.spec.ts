import { BadRequestException } from '@nestjs/common';
import { RagChunkController } from '../src/llm/rag/rag-chunk.controller';
import { RagSearchController } from '../src/llm/rag/rag-search.controller';

describe('RAG controllers', () => {
  it('普通切分返回可还原的 offset', async () => {
    const text = '测'.repeat(600);
    const response = await new RagChunkController().chunk({
      text,
      chunkSize: 500,
      chunkOverlap: 50,
      mode: 'normal',
    });

    expect(response.mode).toBe('normal');
    const chunks = response.chunks as Array<{
      content: string;
      startOffset: number;
      endOffset: number;
    }>;
    for (const chunk of chunks) {
      expect(text.substring(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
    }
  });

  it('Parent-Child 切分返回父子映射', async () => {
    const response = await new RagChunkController().chunk({
      text: '父'.repeat(3000),
      chunkSize: 500,
      mode: 'parent-child',
    });

    expect(response.mode).toBe('parent-child');
    const chunks = response.chunks as {
      parents: Array<{ parentIndex: number }>;
      children: Array<{ childIndex: number; parentIndex: number }>;
    };
    expect(chunks.parents.length).toBeGreaterThan(0);
    expect(chunks.children.length).toBeGreaterThan(chunks.parents.length);
    expect(chunks.children[0]).toHaveProperty('parentIndex');
  });

  it('空切分文本抛 BadRequestException', async () => {
    await expect(new RagChunkController().chunk({ text: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('查询文本先生成 embedding 再检索 pgvector', async () => {
    const embeddingService = { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) };
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce([
          {
            id: 'chunk-1',
            documentId: 'document-1',
            content: '退款规则',
            chunkIndex: 0,
            modelName: 'test-embedding',
            distance: 0.1,
          },
        ]),
    };
    const controller = new RagSearchController(embeddingService as never, prisma as never);

    const result = await controller.search({ query: '退款规则', topK: 3 });

    expect(embeddingService.embedQuery).toHaveBeenCalledWith('退款规则');
    expect(result).toMatchObject({ query: '退款规则', dimension: 3, count: 1 });
    expect(result.results[0].score).toBeCloseTo(0.9, 9);
  });

  it('空查询抛 BadRequestException', async () => {
    const controller = new RagSearchController({ embedQuery: jest.fn() } as never, {} as never);

    await expect(controller.search({ query: ' ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('维度不匹配映射为 BadRequestException', async () => {
    const embeddingService = { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) };
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce([{ dimension: 384 }]) };
    const controller = new RagSearchController(embeddingService as never, prisma as never);

    await expect(controller.search({ query: '退款规则' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
