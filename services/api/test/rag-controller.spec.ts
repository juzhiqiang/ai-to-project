import { BadRequestException } from '@nestjs/common';
import { RagChunkController } from '../src/llm/rag/rag-chunk.controller';
import { RagSearchController } from '../src/llm/rag/rag-search.controller';
import { RagEvaluationController } from '../src/llm/rag/rag-evaluation.controller';

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

describe('RagEvaluationController', () => {
  it('计算多查询的 Recall@K / MRR / NDCG@K', () => {
    const controller = new RagEvaluationController();
    const result = controller.evaluate({
      k: 5,
      samples: [
        {
          label: '退款政策',
          retrieved: ['doc-refund', 'doc-shipping', 'doc-faq'],
          relevant: ['doc-refund'],
        },
        {
          label: '联系客服',
          retrieved: ['doc-faq', 'doc-contact'],
          relevant: ['doc-contact'],
        },
      ],
    });

    // 查询1：相关文档排第1 → RR=1.0, Recall=1.0, NDCG=1.0
    // 查询2：相关文档排第2 → RR=0.5, Recall=1.0, NDCG=1/log2(3)
    expect(result.count).toBe(2);
    expect(result.k).toBe(5);
    expect(result.mrr).toBeCloseTo(0.75, 9);
    expect(result.meanRecall).toBe(1);
    expect(result.samples[0]).toMatchObject({ firstHitRank: 1, rr: 1 });
    expect(result.samples[1]).toMatchObject({ firstHitRank: 2, rr: 0.5 });
    expect(result.samples[1].ndcg).toBeCloseTo(1 / Math.log2(3), 9);
  });

  it('K 默认为 5', () => {
    const result = new RagEvaluationController().evaluate({
      samples: [{ retrieved: ['a'], relevant: ['a'] }],
    });
    expect(result.k).toBe(5);
  });

  it('samples 非数组时抛 BadRequestException', () => {
    expect(() =>
      new RagEvaluationController().evaluate({ samples: 'x' as never }),
    ).toThrow(BadRequestException);
  });

  it('k 非正整数时抛 BadRequestException', () => {
    expect(() =>
      new RagEvaluationController().evaluate({ samples: [], k: 0 }),
    ).toThrow(BadRequestException);
  });
});
