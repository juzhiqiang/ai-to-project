/**
 * 轻量 BM25 关键词检索（纯 JS，零依赖，可单测）。
 *
 * 用于混合检索的关键词兜底路：向量检索对低频专有词（如「解冻」「价保」「二手」）的
 * 语义信号弱，BM25 按词项精确匹配 + IDF 加权能补上这一块。
 *
 * 中文分词采用 bigram（连续中文字符段按二字组切），零依赖、跨平台（Bun/Node/Windows）
 * 通吃，避免引入 nodejieba 等 native 依赖。数据量小（测试库数十 chunks）时效果足够；
 * 生产环境可替换为真正的分词器，接口保持不变。
 */

export interface Bm25Document {
  id: string;
  content: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
}

interface DocStats {
  id: string;
  tokens: string[];
  length: number;
}

const CJK = /[一-鿿]/;
const ALNUM = /[a-zA-Z0-9]/;

/**
 * 中文 bigram 分词：连续中文字符段按二字组切（单字保留），连续字母/数字段按整词切，
 * 其余字符作为分隔符。例子：`冷冻商品解冻` → `冷冻 / 冻商 / 商品 / 品解 / 解冻`。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let cjkRun = '';
  let wordRun = '';

  const flushCjk = () => {
    if (!cjkRun) return;
    if (cjkRun.length === 1) {
      tokens.push(cjkRun);
    } else {
      for (let i = 0; i < cjkRun.length - 1; i++) {
        tokens.push(cjkRun.slice(i, i + 2));
      }
    }
    cjkRun = '';
  };

  const flushWord = () => {
    if (wordRun) {
      tokens.push(wordRun.toLowerCase());
      wordRun = '';
    }
  };

  for (const ch of text) {
    if (CJK.test(ch)) {
      flushWord();
      cjkRun += ch;
    } else if (ALNUM.test(ch)) {
      flushCjk();
      wordRun += ch;
    } else {
      flushCjk();
      flushWord();
    }
  }
  flushCjk();
  flushWord();

  return tokens;
}

/** 基于 BM25 (k1=1.5, b=0.75) 的内存倒排索引。 */
export class Bm25Index {
  private docs: DocStats[] = [];
  private df = new Map<string, number>();
  private avgDocLength = 0;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  constructor(corpus: Bm25Document[]) {
    this.build(corpus);
  }

  private build(corpus: Bm25Document[]): void {
    this.docs = corpus.map((doc) => {
      const tokens = tokenize(doc.content);
      return { id: doc.id, tokens, length: tokens.length };
    });

    const totalLength = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDocLength = this.docs.length ? totalLength / this.docs.length : 0;

    const seen = new Set<string>();
    for (const doc of this.docs) {
      seen.clear();
      for (const token of doc.tokens) {
        if (seen.has(token)) continue;
        seen.add(token);
        this.df.set(token, (this.df.get(token) ?? 0) + 1);
      }
    }
  }

  search(query: string, topK: number): Bm25Hit[] {
    const queryTokens = [...new Set(tokenize(query))];
    const n = this.docs.length;
    if (n === 0 || queryTokens.length === 0) return [];

    const scores = this.docs
      .map((doc) => {
        let score = 0;
        for (const term of queryTokens) {
          const df = this.df.get(term) ?? 0;
          if (df === 0) continue;
          const tf = doc.tokens.filter((t) => t === term).length;
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
          const denominator =
            tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength));
          score += idf * ((tf * (this.k1 + 1)) / denominator);
        }
        return { id: doc.id, score };
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);

    return scores.slice(0, topK);
  }
}