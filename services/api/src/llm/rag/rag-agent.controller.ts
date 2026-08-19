import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
} from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  CHAT_MODEL_FACTORY,
  type ChatModelFactory,
} from '../model.factory';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { type PrismaDbClient } from '../../../rag/retrieval/vector-store';
import { hybridSearch } from '../../../rag/retrieval/hybrid-search';
import { ragAsk, type RagAnswer } from '../../../rag/pipeline/rag-pipeline';
import { createRagTool } from '../../../rag/agent/rag-tool';

type RagAgentBody = {
  question?: string;
  topK?: number;
  /** 预算使用百分比（0-200），用于演示预算检查。默认 0（始终允许）。 */
  budgetUsedPercent?: number;
  /** 是否尝试 LLM 生成回答（需要配置 API Key）。默认 true。 */
  generate?: boolean;
};

type RagAgentResponse = {
  question: string;
  topK: number;
  budgetUsedPercent: number;
  budgetAction: string;
  budgetReason: string;
  result: RagAnswer | { error: string; reason: string };
};

/**
 * 9.6 / 11.10 —— RAG Tool 真实调用入口。
 *
 * 该 controller 把真实依赖（EmbeddingService + pgvector + ChatOpenAI）注入 createRagTool，
 * 让前端页面可以真实测试：输入问题 → 真实 embedding → 真实向量检索 → 可选 LLM 生成，
 * 并可调节 budgetUsedPercent 来观察预算拒绝 / 允许的实际行为。
 */
@Controller('api/rag')
export class RagAgentController {
  private readonly searchClient: PrismaDbClient;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) {
    this.searchClient = prisma as unknown as PrismaDbClient;
  }

  @Post('agent/ask')
  async ask(@Body() body: RagAgentBody): Promise<RagAgentResponse> {
    const question = body.question?.trim();
    if (!question) {
      throw new BadRequestException('question 不能为空');
    }

    const topK = body.topK ?? 4;
    if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
      throw new BadRequestException('topK 必须是 1 到 20 的整数');
    }

    const budgetUsedPercent = body.budgetUsedPercent ?? 0;
    if (
      typeof budgetUsedPercent !== 'number' ||
      Number.isNaN(budgetUsedPercent) ||
      budgetUsedPercent < 0
    ) {
      throw new BadRequestException('budgetUsedPercent 必须是非负数');
    }

    const wantGenerate = body.generate !== false;

    // 构造真实的 ragAsk 依赖
    const ragAskFn = async (
      q: string,
      k?: number,
    ): Promise<RagAnswer> => {
      return ragAsk(
        {
          embedQuery: (text: string) => this.embeddingService.embedQuery(text),
          // 混合检索：以问题原文 q 走 BM25 + 向量 RRF 融合（闭包捕获问题文本）
          similaritySearch: (vector: number[], opts: { topK: number }) =>
            hybridSearch(this.searchClient, q, vector, opts),
          generateAnswer: wantGenerate
            ? (query, citations) => this.generateAnswer(query, citations)
            : undefined,
        },
        q,
        k,
      );
    };

    // 创建 RAG 工具（内部先做预算检查）
    const ragTool = createRagTool({
      ragAsk: ragAskFn,
      budgetInput: {
        budgetUsedPercent,
        agentName: 'functional_expert',
      },
    });

    const raw = await ragTool.invoke({ question, topK });
    const parsed = JSON.parse(raw) as RagAgentResponse['result'];

    return {
      question,
      topK,
      budgetUsedPercent,
      budgetAction:
        'error' in parsed ? 'reject' : 'allow',
      budgetReason:
        'error' in parsed ? parsed.reason : 'budget OK',
      result: parsed,
    };
  }

  /** 真实调用 LLM 基于检索上下文生成回答。 */
  private async generateAnswer(
    question: string,
    citations: { content: string }[],
  ): Promise<string> {
    const context = citations
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join('\n\n');

    const model = this.createChatModel();
    const response = await model.invoke([
      new SystemMessage(
        '你是客服知识库助手。请仅根据下方检索到的文档片段回答用户问题。' +
          '如果文档中没有相关信息，请如实说明。回答要简洁准确。',
      ),
      new HumanMessage(
        `检索到的文档片段：\n\n${context}\n\n用户问题：${question}`,
      ),
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((part: unknown) =>
                typeof part === 'string'
                  ? part
                  : part &&
                      typeof part === 'object' &&
                      'text' in part &&
                      typeof (part as { text?: unknown }).text === 'string'
                    ? (part as { text: string }).text
                    : '',
              )
              .join('')
          : String(response.content ?? '');

    return content.trim();
  }
}

