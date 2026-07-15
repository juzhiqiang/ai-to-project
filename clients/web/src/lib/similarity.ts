/**
 * 向量相似度工具（与 services/api/rag/embedding/similarity.ts 同源逻辑）
 * 零依赖纯函数，便于 Web 端可视化演示。
 */

function assertSameDim(a: number[], b: number[]): void {
  if (a.length !== b.length) {
    throw new RangeError("向量维度不匹配");
  }
}

export function dot(a: number[], b: number[]): number {
  assertSameDim(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

export function l2Norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i]! * v[i]!;
  }
  return Math.sqrt(sum);
}

export function normalize(v: number[]): number[] {
  const norm = l2Norm(v);
  if (norm === 0) {
    return v.slice();
  }
  return v.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  assertSameDim(a, b);
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot(a, b) / (na * nb);
}

export function euclideanDistance(a: number[], b: number[]): number {
  assertSameDim(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** 将逗号/空格分隔的文本解析为 number[] */
export function parseVector(text: string): number[] {
  const parts = text
    .trim()
    .split(/[\s,，;；]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("向量不能为空");
  }
  const values = parts.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) {
      throw new Error(`无法解析数值: ${p}`);
    }
    return n;
  });
  return values;
}
