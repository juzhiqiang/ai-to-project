/**
 * 检索质量评测指标（零依赖纯函数）
 *
 * 提供 Recall@K / MRR / NDCG@K 三种经典检索评测指标，
 * 所有函数不依赖任何外部库，可在任意环境离线运行。
 */

/**
 * Recall@K：Top-K 结果中覆盖了多少比例的相关文档。
 *
 * @param retrievedIds 检索返回的文档 ID 列表（按相关度降序）
 * @param relevantIds  标注的相关文档 ID 列表
 * @param k            截断位置
 * @returns 0–1 之间的浮点数；relevantIds 为空时返回 0
 */
export function recallAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0) {
    return 0;
  }

  const relevantSet = new Set(relevantIds);
  const topK = retrievedIds.slice(0, k);
  let hits = 0;

  for (const id of topK) {
    if (relevantSet.has(id)) {
      hits++;
    }
  }

  return hits / relevantIds.length;
}

/**
 * MRR（Mean Reciprocal Rank）：多个查询的平均倒数排名。
 *
 * 对每个查询，找到第一个命中的相关文档排名 r，倒数排名 = 1/r；
 * 若无命中则为 0。MRR = 所有查询倒数排名的算术平均。
 *
 * @param rankedListsPerQuery 每个查询的检索结果 ID 列表（按排名顺序）
 * @param relevantPerQuery     每个查询的相关文档 ID 列表
 * @returns 0–1 之间的浮点数；查询列表为空时返回 0
 */
export function mrr(
  rankedListsPerQuery: string[][],
  relevantPerQuery: string[][],
): number {
  const numQueries = rankedListsPerQuery.length;

  if (numQueries === 0) {
    return 0;
  }

  let sumRR = 0;

  for (let q = 0; q < numQueries; q++) {
    const ranked = rankedListsPerQuery[q];
    const relevant = new Set(relevantPerQuery[q] ?? []);
    let rr = 0;

    for (let i = 0; i < ranked.length; i++) {
      if (relevant.has(ranked[i])) {
        rr = 1 / (i + 1);
        break;
      }
    }

    sumRR += rr;
  }

  return sumRR / numQueries;
}

/**
 * NDCG@K（Normalized Discounted Cumulative Gain）。
 *
 * 采用二值相关性：命中 = 1，未命中 = 0。
 * DCG@K  = Σ rel_i / log₂(i + 1)，i 从 1 到 K
 * IDCG@K = 理想排序下的 DCG@K（所有相关文档排在最前）
 * NDCG@K = DCG@K / IDCG@K
 *
 * @param retrievedIds 检索返回的文档 ID 列表（按相关度降序）
 * @param relevantIds  标注的相关文档 ID 列表
 * @param k            截断位置
 * @returns 0–1 之间的浮点数；relevantIds 为空时返回 0
 */
export function ndcgAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0) {
    return 0;
  }

  const relevantSet = new Set(relevantIds);
  const topK = retrievedIds.slice(0, k);

  // DCG@K
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const rel = relevantSet.has(topK[i]) ? 1 : 0;
    if (rel > 0) {
      // i 是 0-based，排名 = i+1，log₂(rank+1) = log₂(i+2)
      dcg += rel / Math.log2(i + 2);
    }
  }

  // IDCG@K：理想情况下所有相关文档排在最前
  const idealHits = Math.min(relevantIds.length, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}
