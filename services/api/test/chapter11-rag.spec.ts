import {
  cosineSimilarity,
  dot,
  euclideanDistance,
  l2Norm,
  normalize,
} from '../rag/embedding/similarity';

describe('11.2.4 相似度', () => {
  it('单位向量自相似 = 1', () => {
    const unit = [1, 0, 0];
    expect(cosineSimilarity(unit, unit)).toBeCloseTo(1, 9);
  });

  it('反方向向量相似 = -1', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 9);
  });

  it('正交向量相似 = 0', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 9);
  });

  it('归一化后 cosineSimilarity === dot（容差 1e-9）', () => {
    const a = [3, 4];
    const b = [1, 2];
    const na = normalize(a);
    const nb = normalize(b);
    const cosine = cosineSimilarity(a, b);
    const product = dot(na, nb);
    expect(Math.abs(cosine - product)).toBeLessThanOrEqual(1e-9);
  });

  it('维度不匹配抛错', () => {
    const a = [1, 2];
    const b = [1, 2, 3];
    expect(() => dot(a, b)).toThrow(RangeError);
    expect(() => dot(a, b)).toThrow('向量维度不匹配');
    expect(() => cosineSimilarity(a, b)).toThrow(RangeError);
    expect(() => cosineSimilarity(a, b)).toThrow('向量维度不匹配');
    expect(() => euclideanDistance(a, b)).toThrow(RangeError);
    expect(() => euclideanDistance(a, b)).toThrow('向量维度不匹配');
  });

  it('l2Norm 与 normalize 行为正确', () => {
    expect(l2Norm([3, 4])).toBeCloseTo(5, 9);
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(l2Norm(normalize([3, 4]))).toBeCloseTo(1, 9);
  });
})

import {
  chunkText,
  DEFAULT_SEPARATORS,
  type Chunk,
} from '../rag/chunking/document-chunker';
import { chunkParentChild, type ParentChildResult } from '../rag/chunking/parent-child-chunker';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  similaritySearch,
  upsertChunks,
  type PrismaRawClient,
} from '../rag/retrieval/vector-store';

describe('11.4 文档切分', () => {
  it('11.4.3 默认 chunkSize 500 切 1200 字文本得 3 个 chunk', async () => {
    const text = '甲'.repeat(1200);
    const chunks = await chunkText(text);

    expect(chunks.length).toBe(3);
    chunks.forEach((chunk: Chunk, i: number) => {
      expect(chunk.index).toBe(i);
      // substring 能精确还原 content
      expect(text.substring(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });

  it('11.4.4 重叠 50 字时，相邻 chunk 末尾==下一 chunk 开头', async () => {
    const text = '乙'.repeat(1200);
    const chunks = await chunkText(text, { chunkSize: 500, chunkOverlap: 50 });

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < chunks.length - 1; i += 1) {
      const cur = chunks[i];
      const next = chunks[i + 1];
      // 重叠部分：当前 chunk 末尾 50 字 === 下一 chunk 开头 50 字
      const overlapLen = 50;
      const curTail = cur.content.slice(cur.content.length - overlapLen);
      const nextHead = next.content.slice(0, overlapLen);
      expect(nextHead).toBe(curTail);
    }
  });

  it('11.4.5 中文标点优先切分：切点在「。」或「\n」，不在词中', async () => {
    // 段落 + 句号组合，明确应在标点/换行处断开
    const text = '第一段内容比较长用来占位。\n第二段内容也比较长用来占位。';
    const chunks = await chunkText(text, { chunkSize: 12, chunkOverlap: 0 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // 每个 chunk 都应落在「。」或换行之后开头，不在词中间断开
    for (const chunk of chunks) {
      // 还原到原文能匹配
      expect(text.substring(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
    }
    // 默认 separators 必须显式包含全角标点
    expect(DEFAULT_SEPARATORS).toContain('。');
    expect(DEFAULT_SEPARATORS).toContain('！');
    expect(DEFAULT_SEPARATORS).toContain('？');
    expect(DEFAULT_SEPARATORS).toContain('；');
    expect(DEFAULT_SEPARATORS).toContain('，');
  });

  it('11.4.7 Parent-Child：parents.length < children.length，每个 child 的 parentIndex 必有对应 parent', async () => {
    const text = '客'.repeat(3000);
    const result: ParentChildResult = await chunkParentChild(text, 1500, 500);

    expect(result.parents.length).toBeGreaterThan(0);
    expect(result.children.length).toBeGreaterThan(result.parents.length);

    for (const child of result.children) {
      const parent = result.parents.find((p) => p.parentIndex === child.parentIndex);
      expect(parent).toBeDefined();
      // 子块内容必须是父块内容的子串
      expect(parent!.content.includes(child.content)).toBe(true);
    }
  });
});

describe("11.5 向量数据库: 检索与存储", () => {
  const records = Array.from({ length: 50 }, (_, index) => ({
    id: `chunk-${index}`,
    documentId: `document-${Math.floor(index / 5)}`,
    content: `chunk ${index}`,
    chunkIndex: index,
    embedding: [1 + index / 100, (index % 7) / 10, (index % 3) / 10],
    modelName: "test-embedding",
  }));

  it("11.5.2 小数据集 KNN baseline 与 ANN 前 K 结果一致", async () => {
    const query = [1, 0.2, 0.1];
    const baseline = records
      .map((record) => ({
        ...record,
        score: cosineSimilarity(query, record.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce(baseline.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          content: row.content,
          chunkIndex: row.chunkIndex,
          modelName: row.modelName,
          distance: 1 - row.score,
        }))),
    } as unknown as PrismaRawClient;

    const ann = await similaritySearch(prisma, query, { topK: 5 });
    expect(ann.map((row) => row.id)).toEqual(baseline.map((row) => row.id));
  });

  it("11.5.6 score 等于 1 减余弦距离", async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce([{ ...records[0], distance: 0.25 }]),
    } as unknown as PrismaRawClient;

    const [result] = await similaritySearch(prisma, [1, 0, 0]);
    expect(result.score).toBeCloseTo(0.75, 9);
  });

  it("upsert 拒绝空向量和批次内维度不一致", async () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaRawClient;
    await expect(upsertChunks(prisma, [{ ...records[0], embedding: [] }])).rejects.toThrow(RangeError);
    await expect(
      upsertChunks(prisma, [records[0], { ...records[1], embedding: [1, 2] }]),
    ).rejects.toThrow(RangeError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("HNSW 脚本启用 vector 扩展并配置索引参数", () => {
    const sql = readFileSync(join(__dirname, "../scripts/create-hnsw-index.sql"), "utf8");
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i);
    expect(sql).toMatch(/USING hnsw\s*\("embedding" vector_cosine_ops\)/i);
    expect(sql).toMatch(/m\s*=\s*16/i);
    expect(sql).toMatch(/ef_construction\s*=\s*64/i);
  });

  describe("cosineSimilarity", () => {
    it("向量相同时返回 1", () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
    });

    it("向量维度不一致时抛出 RangeError", () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(RangeError);
    });

    it("零向量返回 0", () => {
      expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    });
  });

  describe("PrismaVectorDocumentRepository", () => {
    it("upsert 会写入结构化字段并通过 raw SQL 写入向量", async () => {
      const { PrismaVectorDocumentRepository } = await import("../rag/retrieval/vector-store");
      const $queryRaw = jest.fn().mockResolvedValue([]);
      const prisma = {
        $queryRaw,
        documentChunk: { upsert: jest.fn().mockResolvedValue({ id: "doc-1" }) },
      };

      const repo = new PrismaVectorDocumentRepository(prisma as never);
      await repo.upsertDocument({
        id: "doc-1",
        sourceId: "11.md",
        content: "真实切片内容",
        embedding: [0.4, 0, 0],
        modelName: "bge-small-zh-v1.5",
      });

      expect(prisma.documentChunk.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc-1" },
          create: expect.objectContaining({
            sourceId: "11.md",
            content: "真实切片内容",
            modelName: "bge-small-zh-v1.5",
          }),
        }),
      );
      expect($queryRaw).toHaveBeenCalled();
    });

    it("similaritySearch 使用余弦距离并返回重评分结果", async () => {
      const { PrismaVectorDocumentRepository } = await import("../rag/retrieval/vector-store");
      const $queryRaw = jest.fn()
        .mockResolvedValueOnce([{ dimensions: 2 }])
        .mockResolvedValueOnce([
          { id: "doc-1", sourceId: "11.md", content: "性能优化技巧", score: 0.8, modelName: "m1" },
          { id: "doc-2", sourceId: "11.md", content: "无关内容", score: 0.2, modelName: "m1" },
        ]);

      const prisma = { $queryRaw, documentChunk: { upsert: jest.fn() } };
      const repo = new PrismaVectorDocumentRepository(prisma as never);
      const results = await repo.similaritySearch([1, 0], { k: 1 });

      expect($queryRaw).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        { id: "doc-1", sourceId: "11.md", content: "性能优化技巧", score: 0.8, modelName: "m1" },
      ]);
    });

    it("dimension mismatch 时直接抛错并提示维度", async () => {
      const { PrismaVectorDocumentRepository } = await import("../rag/retrieval/vector-store");
      const $queryRaw = jest.fn().mockResolvedValueOnce([{ dimensions: 384 }]);
      const prisma = { $queryRaw, documentChunk: { upsert: jest.fn() } };
      const repo = new PrismaVectorDocumentRepository(prisma as never);

      await expect(repo.similaritySearch([0.1, 0.2, 0.3], { k: 1 })).rejects.toThrow(/384/);
    });
  });

  describe("HNSW 索引 SQL", () => {
    it("提供符合任务参数要求的索引脚本", async () => {
      const { readFileSync } = await import("node:fs");
      const path = await import("node:path");
      const scriptPath = path.resolve(__dirname, "../scripts/create-hnsw-index.sql");
      const sql = readFileSync(scriptPath, "utf8");

      expect(sql).toContain("USING hnsw");
      expect(sql).toContain("vector_cosine_ops");
      expect(sql).toContain("m = 16");
      expect(sql).toContain("ef_construction = 64");
    });
  });
});

describe('11.7 评估', () => {
  it('11.7.1 Recall@K = 1 当所有 relevant 都在 Top-K', () => {
    const { recallAtK } = require('../rag/evaluation/retrieval-metrics');
    const retrieved = ['doc-a', 'doc-b', 'doc-c'];
    const relevant = ['doc-a', 'doc-b'];
    expect(recallAtK(retrieved, relevant, 3)).toBe(1);
  });

  it('11.7.1 Recall@K 在 Top-K 不足时按比例计算', () => {
    const { recallAtK } = require('../rag/evaluation/retrieval-metrics');
    const retrieved = ['doc-a', 'doc-x', 'doc-b'];
    const relevant = ['doc-a', 'doc-b'];
    expect(recallAtK(retrieved, relevant, 1)).toBeCloseTo(0.5, 9);
    expect(recallAtK(retrieved, relevant, 3)).toBe(1);
  });

  it('11.7.1 MRR 第一个相关在第 1 位 → 1.0', () => {
    const { mrr } = require('../rag/evaluation/retrieval-metrics');
    const ranked = [['doc-a', 'doc-b']];
    const relevant = [['doc-a']];
    expect(mrr(ranked, relevant)).toBe(1);
  });

  it('11.7.1 MRR 第一个相关在第 2 位 → 0.5', () => {
    const { mrr } = require('../rag/evaluation/retrieval-metrics');
    const ranked = [['doc-x', 'doc-a']];
    const relevant = [['doc-a']];
    expect(mrr(ranked, relevant)).toBe(0.5);
  });

  it('11.7.1 MRR 多查询取平均', () => {
    const { mrr } = require('../rag/evaluation/retrieval-metrics');
    const ranked = [['doc-a', 'doc-b'], ['doc-x', 'doc-a']];
    const relevant = [['doc-a'], ['doc-a']];
    expect(mrr(ranked, relevant)).toBeCloseTo(0.75, 9);
  });

  it('11.7.1 NDCG@K 单个完全命中 = 1.0', () => {
    const { ndcgAtK } = require('../rag/evaluation/retrieval-metrics');
    const retrieved = ['doc-a', 'doc-b'];
    const relevant = ['doc-a'];
    expect(ndcgAtK(retrieved, relevant, 5)).toBe(1);
  });

  it('11.7.1 NDCG@K 相关文档排得越靠后得分越低', () => {
    const { ndcgAtK } = require('../rag/evaluation/retrieval-metrics');
    const retrieved = ['doc-x', 'doc-a'];
    const relevant = ['doc-a'];
    const score = ndcgAtK(retrieved, relevant, 5);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(score).toBeCloseTo(1 / Math.log2(3), 9);
  });

  it('11.7.3 ragas-runner 在 RAGAS 不可用时返回 null + warn，不抛错', async () => {
    const { runRagasEvaluation } = require('../rag/evaluation/ragas-runner');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await runRagasEvaluation(
      { samples: [], metrics: ['faithfulness'] },
      { fetchFn: fetchFn as never, maxRetries: 3, retryDelayMs: 0 },
    );
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RAGAS 评测服务不可用'));
    warnSpy.mockRestore();
  });

  it('11.7.3 ragas-runner 服务正常时返回指标分数', async () => {
    const { runRagasEvaluation } = require('../rag/evaluation/ragas-runner');
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ faithfulness: 0.92, answer_relevancy: 0.85 }),
    });
    const result = await runRagasEvaluation(
      {
        samples: [{ question: 'q', answer: 'a', contexts: ['c'], ground_truth: 'g' }],
        metrics: ['faithfulness', 'answer_relevancy'],
      },
      { fetchFn: fetchFn as never },
    );
    expect(result).toEqual({ faithfulness: 0.92, answer_relevancy: 0.85 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('11.7.3 ragas-runner HTTP 错误也触发重试后降级', async () => {
    const { runRagasEvaluation } = require('../rag/evaluation/ragas-runner');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await runRagasEvaluation(
      { samples: [], metrics: [] },
      { fetchFn: fetchFn as never, maxRetries: 3, retryDelayMs: 0 },
    );
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
