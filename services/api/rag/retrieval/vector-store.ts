export interface PrismaRawClient {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

export interface VectorStoreRecord {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  modelName: string;
}

export interface SearchOptions {
  topK?: number;
  modelName?: string;
}

export type PrismaDbClient = PrismaRawClient & {
  document?: unknown;
  documentChunk?: unknown;
};

export interface SearchResult extends Omit<VectorStoreRecord, "embedding"> {
  distance: number;
  score: number;
}

export interface SearchResultRecord {
  id: string;
  sourceId: string | null;
  content: string;
  score: number;
  modelName: string;
}

type DocumentChunkClient = {
  documentChunk: {
    upsert(args: unknown): Promise<unknown>;
  };
};

function assertVector(vector: number[], label: string): void {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${label} 必须包含至少一个有限数字`);
  }
}

function vectorLiteral(vector: number[]): string {
  assertVector(vector, "向量");
  return `[${vector.join(",")}]`;
}

function readDimension(row: { dimension?: number; dimensions?: number } | undefined): number | null {
  return row?.dimension ?? row?.dimensions ?? null;
}

export async function upsertChunks(
  prisma: PrismaRawClient,
  records: VectorStoreRecord[],
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  const dimension = records[0].embedding.length;
  for (const record of records) {
    assertVector(record.embedding, "记录向量");
    if (record.embedding.length !== dimension) {
      throw new RangeError("批次内记录向量维度不一致");
    }
  }

  for (const record of records) {
    const embedding = vectorLiteral(record.embedding);
    await prisma.$queryRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "content", "chunkIndex", "embedding", "modelName")
      VALUES
        (${record.id}, ${record.documentId}, ${record.content}, ${record.chunkIndex}, ${embedding}::vector, ${record.modelName})
      ON CONFLICT ("documentId", "chunkIndex") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "modelName" = EXCLUDED."modelName"
      RETURNING "id"
    `;
  }

  return records.length;
}

export async function similaritySearch(
  prisma: PrismaRawClient,
  queryVector: number[],
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const query = vectorLiteral(queryVector);
  const topK = options.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) {
    throw new RangeError("topK 必须是 1 到 100 的整数");
  }

  const dimRows = await prisma.$queryRaw<Array<{ dimension: number; dimensions?: number }>>`
    SELECT vector_dims("embedding")::int AS "dimension"
    FROM "DocumentChunk"
    WHERE "embedding" IS NOT NULL
    LIMIT 1
  `;
  const dimension = readDimension(dimRows[0]);
  if (dimension == null) {
    return [];
  }
  if (dimension !== queryVector.length) {
    throw new RangeError(`查询向量维度 ${queryVector.length} 与数据库维度 ${dimension} 不一致`);
  }

  const modelName = options.modelName?.trim() || null;
  const rows = await prisma.$queryRaw<Array<Omit<SearchResult, "score">>>`
    SELECT
      "id",
      "documentId",
      "content",
      "chunkIndex",
      "modelName",
      ("embedding" <=> ${query}::vector)::float8 AS "distance"
    FROM "DocumentChunk"
    WHERE "embedding" IS NOT NULL
      AND (${modelName}::text IS NULL OR "modelName" = ${modelName})
    ORDER BY "embedding" <=> ${query}::vector
    LIMIT ${topK}
  `;

  return rows.map((row) => ({
    ...row,
    distance: Number(row.distance),
    score: 1 - Number(row.distance),
  }));
}

export class PrismaVectorDocumentRepository {
  constructor(private readonly prisma: PrismaRawClient & DocumentChunkClient) {}

  async upsertDocument(doc: {
    id: string;
    sourceId: string;
    content: string;
    embedding: number[];
    modelName: string;
  }): Promise<void> {
    await this.prisma.documentChunk.upsert({
      where: { id: doc.id },
      create: {
        id: doc.id,
        sourceId: doc.sourceId,
        content: doc.content,
        modelName: doc.modelName,
      },
      update: {
        content: doc.content,
        modelName: doc.modelName,
      },
    });

    const embedding = vectorLiteral(doc.embedding);
    await this.prisma.$queryRaw`
      UPDATE "DocumentChunk"
      SET "embedding" = ${embedding}::vector
      WHERE "id" = ${doc.id}
    `;
  }

  async similaritySearch(
    queryEmbedding: number[],
    options: { k?: number } = {},
  ): Promise<SearchResultRecord[]> {
    const k = options.k ?? 4;
    const query = vectorLiteral(queryEmbedding);
    const dimRows = await this.prisma.$queryRaw<Array<{ dimensions: number; dimension?: number }>>`
      SELECT vector_dims("embedding")::int AS "dimensions"
      FROM "DocumentChunk"
      WHERE "embedding" IS NOT NULL
      LIMIT 1
    `;
    const dimensions = readDimension(dimRows[0]);
    if (dimensions == null) {
      return [];
    }
    if (dimensions !== queryEmbedding.length) {
      throw new RangeError(`查询向量维度 ${queryEmbedding.length} 与数据库维度 ${dimensions} 不一致`);
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sourceId: string | null;
        content: string;
        modelName: string;
        distance?: number;
        score?: number;
      }>
    >`
      SELECT
        "id",
        "sourceId",
        "content",
        "modelName",
        ("embedding" <=> ${query}::vector)::float8 AS "distance"
      FROM "DocumentChunk"
      WHERE "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${query}::vector
      LIMIT ${k}
    `;

    return rows.slice(0, k).map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      content: row.content,
      modelName: row.modelName,
      score: row.score ?? 1 - Number(row.distance),
    }));
  }
}
