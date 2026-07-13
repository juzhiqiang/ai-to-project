import { PrismaClient } from '@prisma/client';

export interface TokenUsageRecord {
  conversationId?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  graphName: string;
  nodeName: string;
  agentName: string;
  modelConfigId?: string | null;
  modelName: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number | null;
  cachedInputTokens?: number;
  estimatedCostUsd: number;
  isEstimated: boolean;
  latencyMs: number;
  overrideReason?: string | null;
  createdAt?: Date;
}

export interface MonthlyStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  calls: number;
}

export interface NodeStats {
  nodeName: string;
  totalCost: number;
  calls: number;
}

export interface AgentStats {
  agentName: string;
  totalCost: number;
  calls: number;
}

export class TokenUsageService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordUsage(record: TokenUsageRecord): Promise<void> {
    try {
      const finalRecord = {
        ...record,
        totalTokens: record.totalTokens ?? record.inputTokens + record.outputTokens,
        provider: record.provider ?? 'openai',
      };
      await this.prisma.tokenUsage.create({
        data: finalRecord as any,
      });
    } catch (error) {
      // 侧路写入失败不阻塞主流程
      console.warn('[TokenUsageService] Failed to record usage:', error);
    }
  }

  async getMonthlyStats(): Promise<MonthlyStats> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await this.prisma.tokenUsage.aggregate({
      where: {
        createdAt: {
          gte: monthStart,
        },
      },
      _sum: {
        estimatedCostUsd: true,
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
      },
      _count: true,
    });

    return {
      totalCost: result._sum.estimatedCostUsd ?? 0,
      totalInputTokens: result._sum.inputTokens ?? 0,
      totalOutputTokens: result._sum.outputTokens ?? 0,
      totalCachedTokens: result._sum.cachedInputTokens ?? 0,
      calls: result._count,
    };
  }

  async getStatsByNode(): Promise<NodeStats[]> {
    const result = await this.prisma.tokenUsage.groupBy({
      by: ['nodeName'],
      _sum: {
        estimatedCostUsd: true,
      },
      _count: true,
      orderBy: {
        _sum: {
          estimatedCostUsd: 'desc',
        },
      },
    });

    return result.map((r) => ({
      nodeName: r.nodeName ?? 'unknown',
      totalCost: r._sum.estimatedCostUsd ?? 0,
      calls: r._count,
    }));
  }

  async getStatsByAgent(): Promise<AgentStats[]> {
    const result = await this.prisma.tokenUsage.groupBy({
      by: ['agentName'],
      _sum: {
        estimatedCostUsd: true,
      },
      _count: true,
      orderBy: {
        _sum: {
          estimatedCostUsd: 'desc',
        },
      },
    });

    return result.map((r) => ({
      agentName: r.agentName ?? 'unknown',
      totalCost: r._sum.estimatedCostUsd ?? 0,
      calls: r._count,
    }));
  }

  async isOverBudget(monthlyBudgetUsd: number): Promise<boolean> {
    const stats = await this.getMonthlyStats();
    return stats.totalCost > monthlyBudgetUsd;
  }
}
