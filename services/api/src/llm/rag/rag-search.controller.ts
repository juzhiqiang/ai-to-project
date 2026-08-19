import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmbeddingService } from "../embedding/embedding.service";
import {
  similaritySearch,
  type PrismaDbClient,
} from "../../../rag/retrieval/vector-store";
import { hybridSearch } from "../../../rag/retrieval/hybrid-search";

type RagSearchBody = {
  query?: string;
  topK?: number;
  modelName?: string;
  mode?: "hybrid" | "vector";
};

@Controller("api/rag")
export class RagSearchController {
  private readonly searchClient: PrismaDbClient;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
  ) {
    this.searchClient = prisma as unknown as PrismaDbClient;
  }

  @Post("search")
  async search(@Body() body: RagSearchBody) {
    const query = body.query?.trim();
    if (!query) {
      throw new BadRequestException("query 不能为空");
    }

    const topK = body.topK ?? 5;
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) {
      throw new BadRequestException("topK 必须是 1 到 100 的整数");
    }

    const vector = await this.embeddingService.embedQuery(query);
    const mode = body.mode ?? "hybrid";

    try {
      const results =
        mode === "vector"
          ? await similaritySearch(this.searchClient, vector, {
              topK,
              modelName: body.modelName,
            })
          : await hybridSearch(this.searchClient, query, vector, {
              topK,
              modelName: body.modelName,
            });

      return {
        query,
        mode,
        dimension: vector.length,
        count: results.length,
        results,
      };
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
