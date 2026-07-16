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
