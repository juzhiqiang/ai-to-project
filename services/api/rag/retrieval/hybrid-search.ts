/**
 * 混合检索：向量余弦 + BM25 关键词，RRF（Reciprocal Rank Fusion）融合。
 *
 * 动机：纯向量检索对低频专有词（「解冻」「价保」「二手」等）语义信号弱，
 * BM25 关键词路按词项精确匹配 + IDF 加权能补上召回；RRF 按排名融合比直接加权分数更稳健。
 *
 * 注意：
 * - 返回的 `score` 是 RRF 融合分（多路排名倒数之和），非 cosine 距离相似度，量级不同仅用于排序。
 * - 关键词路每次检索把全部 chunk 拉进内存重建 BM25 索引，适合当前测试量级；生产需加缓存/invalidation。
 */

import {
  similaritySearch,
  type PrismaDbClient,
  type SearchResult,
} from "./vector-store";
import { Bm25Index } from "./bm25";

export interface HybridSearchOptions {
  topK?: number;
  modelName?: string;
}

/** 对多路 ranked list 做 RRF 融合，返回 id -> 融合分。 */
function rrfFuse(
  lists: Array<Array<{ id: string; score: number }>>,
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}

export async function hybridSearch(
  prisma: PrismaDbClient,
  queryText: string,
  queryVector: number[],
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const topK = options.topK ?? 5;
  const fetchK = Math.max(topK, Math.min(100, topK * 3));

  // 1. 向量路
  const vectorResults = await similaritySearch(prisma, queryVector, {
    topK: fetchK,
    modelName: options.modelName,
  });

  // 2. 关键词 BM25 路：全量拉 chunk（排除无向量的记录）
  const modelName = options.modelName?.trim() || null;
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      documentId: string;
      content: string;
      chunkIndex: number;
      modelName: string;
    }>
  >`
    SELECT "id", "documentId", "content", "chunkIndex", "modelName"
    FROM "DocumentChunk"
    WHERE "embedding" IS NOT NULL
      AND (${modelName}::text IS NULL OR "modelName" = ${modelName})
  `;

  const index = new Bm25Index(
    rows.map((row) => ({ id: row.id, content: row.content })),
  );
  const bm25Hits = index.search(queryText, fetchK);

  // 3. RRF 融合两路排名
  const fused = rrfFuse([
    vectorResults.map((r) => ({ id: r.id, score: r.score })),
    bm25Hits,
  ]);

  // 组装完整 SearchResult（向量路已含 distance；仅 BM25 命中的记录 distance=0）
  const byId = new Map<string, SearchResult>();
  for (const r of vectorResults) byId.set(r.id, r);
  for (const c of rows) {
    if (!byId.has(c.id)) {
      byId.set(c.id, {
        id: c.id,
        documentId: c.documentId,
        content: c.content,
        chunkIndex: c.chunkIndex,
        modelName: c.modelName,
        distance: 0,
        score: 0,
      });
    }
  }

  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, rrfScore]) => ({ ...byId.get(id)!, score: rrfScore }));
}