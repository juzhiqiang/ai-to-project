import { chunkText, type Chunk } from './document-chunker';

export interface ParentChunk {
  parentIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  childIndexes: number[];
}

export interface ChildChunk {
  childIndex: number;
  parentIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface ParentChildResult {
  parents: ParentChunk[];
  children: ChildChunk[];
}

/**
 * Parent-Child 切分：先把文本切成 parentSize 的父块，再在每个父块内切成 childSize 的子块。
 * 每个子块都记录所属 parentIndex，便于向量化子块、召回后回退到父块上下文。
 */
export async function chunkParentChild(
  text: string,
  parentSize = 1500,
  childSize = 500,
): Promise<ParentChildResult> {
  if (!text) {
    return { parents: [], children: [] };
  }

  const parentChunks: Chunk[] = await chunkText(text, { chunkSize: parentSize, chunkOverlap: 0 });
  const parents: ParentChunk[] = [];
  const children: ChildChunk[] = [];
  let childIndex = 0;

  for (const parent of parentChunks) {
    const childChunks: Chunk[] = await chunkText(parent.content, {
      chunkSize: childSize,
      chunkOverlap: 0,
    });

    const childIndexes: number[] = [];

    for (const child of childChunks) {
      // 子块偏移量是相对原文的全局偏移（父块偏移 + 子块在父块中的偏移）。
      const startOffset = parent.startOffset + child.startOffset;
      const endOffset = parent.startOffset + child.endOffset;

      children.push({
        childIndex,
        parentIndex: parent.index,
        content: child.content,
        startOffset,
        endOffset,
      });
      childIndexes.push(childIndex);
      childIndex += 1;
    }

    parents.push({
      parentIndex: parent.index,
      content: parent.content,
      startOffset: parent.startOffset,
      endOffset: parent.endOffset,
      childIndexes,
    });
  }

  return { parents, children };
}
