/**
 * 向量相似度工具（零依赖纯函数）
 *
 * 演示余弦相似度 / 欧氏距离，并验证：
 * L2 归一化后 cosineSimilarity(a, b) === dot(normalize(a), normalize(b))
 */

function assertSameDim(a: number[], b: number[]): void {
  if (a.length !== b.length) {
    throw new RangeError('向量维度不匹配');
  }
}

/** 点积 a · b */
export function dot(a: number[], b: number[]): number {
  assertSameDim(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/** L2 范数 ‖v‖₂ */
export function l2Norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/** 返回 L2 归一化后的新向量；零向量原样返回副本 */
export function normalize(v: number[]): number[] {
  const norm = l2Norm(v);
  if (norm === 0) {
    return v.slice();
  }
  return v.map((x) => x / norm);
}

/**
 * 余弦相似度：cos θ = (a · b) / (‖a‖ ‖b‖)
 * 任一向量为零向量时返回 0
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  assertSameDim(a, b);
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot(a, b) / (na * nb);
}

/** 欧氏距离 ‖a − b‖₂ */
export function euclideanDistance(a: number[], b: number[]): number {
  assertSameDim(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
