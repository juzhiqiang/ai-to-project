import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface Chunk {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

// 中文优先的分隔符：先按段落/换行，再按全角标点，最后落到单字符/空格。
export const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''];

/**
 * 把文本切分为带原文偏移量的 chunk。
 * startOffset / endOffset 保证 text.substring(startOffset, endOffset) === content，
 * 因此可在原文中精确还原每个 chunk。
 */
export async function chunkText(text: string, options: ChunkOptions = {}): Promise<Chunk[]> {
  const {
    chunkSize = 500,
    chunkOverlap = 50,
    separators = DEFAULT_SEPARATORS,
  } = options;

  if (!text) {
    return [];
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators,
  });

  const pieces = await splitter.splitText(text);

  const chunks: Chunk[] = [];
  let searchFrom = 0;

  pieces.forEach((piece, index) => {
    // 从上一 chunk 起点之后开始查找，确保重叠 chunk 命中原文中靠后的真实位置。
    let startOffset = text.indexOf(piece, searchFrom);
    if (startOffset === -1) {
      // 兜底：在全文中查找（理论上 splitText 的每个 piece 都是原文子串）。
      startOffset = text.indexOf(piece);
    }
    if (startOffset === -1) {
      startOffset = 0;
    }

    const endOffset = startOffset + piece.length;
    chunks.push({
      index,
      content: piece,
      startOffset,
      endOffset,
    });

    // 下一 chunk 必然从当前 chunk 起点之后出现（重叠也包含在内）。
    searchFrom = startOffset + 1;
  });

  return chunks;
}
