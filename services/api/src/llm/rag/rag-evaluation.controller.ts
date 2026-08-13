import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import {
  mrr,
  ndcgAtK,
  recallAtK,
} from "../../../rag/evaluation/retrieval-metrics";

/** 单条检索评测样本 */
type EvaluationSample = {
  /** 问题描述（可选，用于展示） */
  label?: string;
  /** 检索返回的文档 ID 列表（按相关度降序） */
  retrieved: string[];
  /** 标注的相关文档 ID 列表 */
  relevant: string[];
};

/** 评测请求体 */
type EvaluationBody = {
  samples: EvaluationSample[];
  /** K 值，默认 5 */
  k?: number;
};

/** 单条样本的计算结果 */
type SampleResult = {
  label: string;
  retrievedIds: string[];
  relevantIds: string[];
  recall: number;
  ndcg: number;
  firstHitRank: number | null;
  rr: number;
};

/** 完整评测响应 */
type EvaluationResponse = {
  k: number;
  count: number;
  meanRecall: number;
  meanNdcg: number;
  mrr: number;
  samples: SampleResult[];
};

/** 计算单个样本的 RR 与首次命中排名 */
function computeRR(
  retrievedIds: string[],
  relevantIds: string[],
): { firstHitRank: number | null; rr: number } {
  const relevantSet = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantSet.has(retrievedIds[i])) {
      return { firstHitRank: i + 1, rr: 1 / (i + 1) };
    }
  }
  return { firstHitRank: null, rr: 0 };
}

@Controller("api/rag")
export class RagEvaluationController {
  @Post("evaluate")
  evaluate(@Body() body: EvaluationBody): EvaluationResponse {
    if (!Array.isArray(body.samples)) {
      throw new BadRequestException("samples 必须是数组");
    }

    const k = body.k ?? 5;
    if (!Number.isInteger(k) || k < 1) {
      throw new BadRequestException("k 必须是正整数");
    }

    const samples: SampleResult[] = body.samples.map((sample, index) => {
      const retrievedIds = Array.isArray(sample?.retrieved)
        ? sample.retrieved
        : [];
      const relevantIds = Array.isArray(sample?.relevant)
        ? sample.relevant
        : [];
      const { firstHitRank, rr } = computeRR(retrievedIds, relevantIds);
      return {
        label: sample?.label ?? `查询 #${index + 1}`,
        retrievedIds,
        relevantIds,
        recall: recallAtK(retrievedIds, relevantIds, k),
        ndcg: ndcgAtK(retrievedIds, relevantIds, k),
        firstHitRank,
        rr,
      };
    });

    const valid = samples.filter((s) => s.relevantIds.length > 0);
    const meanRecall =
      valid.length > 0
        ? valid.reduce((sum, s) => sum + s.recall, 0) / valid.length
        : 0;
    const meanNdcg =
      valid.length > 0
        ? valid.reduce((sum, s) => sum + s.ndcg, 0) / valid.length
        : 0;
    const overallMrr = mrr(
      samples.map((s) => s.retrievedIds),
      samples.map((s) => s.relevantIds),
    );

    return {
      k,
      count: samples.length,
      meanRecall,
      meanNdcg,
      mrr: overallMrr,
      samples,
    };
  }
}
