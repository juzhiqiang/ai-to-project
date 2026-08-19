import type { SearchResult } from '../retrieval/vector-store';

/**
 * RAG 检索 + 可选生成流水线（11.6 / 9.6）。
 *
 * 设计要点：
 * - ragAsk 是纯函数风格，所有外部能力通过 deps 注入（embedQuery / similaritySearch / generateAnswer），
 *   方便单测时整体 mock，也方便在 NestJS controller 里注入真实实现。
 * - generateAnswer 可选：有 LLM 时做真实生成；没有或失败时降级为拼接检索片段，保证始终返回可用结果。
 */

/** 单条引用（检索命中的文档片段）。 */
export interface RagCitation {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  score: number;
}

/** ragAsk 的返回结构。 */
export interface RagAnswer {
  /** 最终回答文本（生成或拼接）。 */
  answer: string;
  /** 检索命中的引用列表。 */
  citations: RagCitation[];
  /** answer 是否由 LLM 生成；false 表示是降级拼接。 */
  generated: boolean;
}

/** ragAsk 依赖注入接口。 */
export interface RagAskDeps {
  /** 将自然语言问题编码为向量。 */
  embedQuery: (text: string) => Promise<number[]>;
  /** 在向量库中做近邻检索。 */
  similaritySearch: (
    vector: number[],
    options: { topK: number },
  ) => Promise<SearchResult[]>;
  /** 可选：基于检索到的上下文做 LLM 生成。 */
  generateAnswer?: (
    question: string,
    citations: RagCitation[],
  ) => Promise<string>;
}

function toCitation(result: SearchResult): RagCitation {
  return {
    id: result.id,
    documentId: result.documentId,
    content: result.content,
    chunkIndex: result.chunkIndex,
    score: result.score,
  };
}

function fallbackAnswer(citations: RagCitation[]): string {
  return citations
    .map((citation, index) => `[${index + 1}] ${citation.content}`)
    .join('\n\n');
}

/**
 * 执行一次 RAG 检索（+可选生成）。
 *
 * @param deps  注入依赖
 * @param question  用户问题
 * @param topK  返回的文档数量，默认 4
 */
export async function ragAsk(
  deps: RagAskDeps,
  question: string,
  topK = 4,
): Promise<RagAnswer> {
  const vector = await deps.embedQuery(question);
  const results = await deps.similaritySearch(vector, { topK });
  const citations = results.map(toCitation);

  if (citations.length === 0) {
    return {
      answer: '未检索到相关文档，无法生成回答。',
      citations: [],
      generated: false,
    };
  }

  if (deps.generateAnswer) {
    try {
      const answer = await deps.generateAnswer(question, citations);
      return { answer, citations, generated: true };
    } catch {
      // LLM 不可用时降级为拼接检索结果
    }
  }

  return { answer: fallbackAnswer(citations), citations, generated: false };
}

