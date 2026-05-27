import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export interface SimilaritySearchResult {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

interface RawRow {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  distance: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async similaritySearch(
    query: string,
    userId: string,
    topK = 5,
  ): Promise<SimilaritySearchResult[]> {
    const queryVector = await this.embeddingService.embedQuery(query);
    const vectorLiteral = `[${queryVector.join(',')}]`;
    const limit = Math.max(1, Math.min(50, Math.floor(topK)));

    const rows = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `
      SELECT
        c.id,
        c."documentId",
        c.content,
        c.metadata,
        (c.embedding <=> $1::vector) AS distance
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE d."userId" = $2 AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT ${limit}
      `,
      vectorLiteral,
      userId,
    );

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      content: row.content,
      metadata: row.metadata,
      score: 1 - Number(row.distance),
    }));
  }
}
