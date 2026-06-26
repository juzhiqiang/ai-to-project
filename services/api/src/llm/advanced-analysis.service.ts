import { Injectable } from '@nestjs/common';
import { type BaseMessage } from '@langchain/core/messages';
import { OrchestratorService, type OrchestratorResult } from './agents/orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService, type SimilaritySearchResult } from '../embedding/search.service';
import { DbChatMessageHistory } from '../conversation/db-chat-history';

/** 检索到的文档片段（精简后用于 API 响应） */
export interface RetrievedDocument {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}

/** 统一分析结果 */
export interface AdvancedAnalysisResult {
  conversationId: string;
  input: string;
  report: string;
  usedAgents: OrchestratorResult['usedAgents'];
  retrievedDocuments: RetrievedDocument[];
  orchestration: OrchestratorResult;
}

/** 语义检索 top-K */
const RETRIEVAL_TOP_K = 4;

/**
 * 统一分析服务：整合「会话历史 + RAG 检索 + 多 Agent 编排」的完整链路。
 *
 * 调用链：DB 会话历史 → 语义检索用户文档 → 拼接上下文注入 Orchestrator →
 * 多 Agent 分析 → 结果写回 Message 表 → 返回完整报告。
 */
@Injectable()
export class AdvancedAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestratorService: OrchestratorService,
    private readonly searchService: SearchService,
  ) {}

  async analyze(
    userId: string,
    conversationId: string,
    input: string,
  ): Promise<AdvancedAnalysisResult> {
    // 1. 从数据库读取会话历史（DbChatMessageHistory 基于 Message 表）
    const history = new DbChatMessageHistory(this.prisma, conversationId);
    const historyMessages = await history.getMessages();

    // 3. 语义检索当前用户的文档，获取相关上下文
    const retrieved = await this.searchService.similaritySearch(input, userId, RETRIEVAL_TOP_K);

    // 2 + 4. 拼接历史上下文，并将检索到的政策文档显式注入多 Agent 编排
    const orchestration = await this.orchestratorService.orchestrate({
      input: buildConversationInput(historyMessages, input),
      policyContext: buildPolicyContext(retrieved),
    });
    const report = buildFinalReport(orchestration);

    // 5. 将本轮对话（human 输入 + ai 报告）写入 Message 表
    await history.addUserMessage(input);
    await history.addAIMessage(report);

    // 6. 返回完整分析报告
    return {
      conversationId,
      input,
      report,
      usedAgents: orchestration.usedAgents,
      retrievedDocuments: retrieved.map((row) => ({
        chunkId: row.id,
        documentId: row.documentId,
        content: row.content,
        score: row.score,
      })),
      orchestration,
    };
  }
}

/**
 * 拼接历史上下文和当前输入，供抽取、风控、摘要 Agent 看到完整对话。
 */
function buildConversationInput(history: BaseMessage[], input: string): string {
  const historyContext =
    history.length > 0
      ? history.map((message) => `${message.getType()}: ${messageText(message)}`).join('\n')
      : '无历史上下文';

  return [
    '历史上下文：',
    historyContext,
    '',
    '当前输入：',
    input,
  ].join('\n');
}

/**
 * 单独构造 RAG 政策上下文，显式传入 policyCheckAgent / summaryAgent 等。
 */
function buildPolicyContext(retrieved: SimilaritySearchResult[]): string {
  return retrieved.length > 0
    ? retrieved.map((row, index) => `【参考文档 ${index + 1}】\n${row.content}`).join('\n\n')
    : '无相关政策文档';
}

function messageText(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

function buildFinalReport(orchestration: OrchestratorResult): string {
  if (orchestration.mode === 'clarification') {
    return `请补充信息：${orchestration.clarificationQuestions.join('；')}`;
  }

  if (orchestration.mode === 'fallback') {
    return '系统暂时无法完成自动分析，已转人工复核。';
  }

  return orchestration.report;
}
