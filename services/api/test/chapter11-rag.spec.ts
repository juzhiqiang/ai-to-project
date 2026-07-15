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
});
