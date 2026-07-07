import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';
import type { OrchestratorResult } from '../../src/llm/agents/orchestrator.service';

const USER_ID = 'user-ec-001';
const CONVERSATION_ID = 'conv-ec-001';
const INPUT = '帮我判断一下能不能退，如果可以请告诉我下一步操作';

const COMPLETED_ORCHESTRATION: OrchestratorResult = {
  mode: 'completed',
  clarificationQuestions: [],
  usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
  fallback: null,
  steps: [
    { agent: 'extractAgent', output: '{"orderId":"EC20240315001"}' },
    { agent: 'policyCheckAgent', output: '符合退货条件。' },
    { agent: 'riskReviewAgent', output: '低风险。' },
    { agent: 'qaAgent', output: 'Given 未拆封 When 申请退货 Then 进入退货流程' },
    { agent: 'summaryAgent', output: '# 退货判断报告\n建议通过退货申请。' },
  ],
  graphTrace: [],
  report: '# 退货判断报告\n建议通过退货申请。',
};

describe('AdvancedAnalysisService', () => {
  // 模拟 Prisma：DbChatMessageHistory 通过 message.findMany 读历史、message.create 写消息
  const prisma = {
    message: {
      findMany: jest.fn(),
      create: jest.fn(async () => ({})),
    },
  };
  const orchestratorService = {
    orchestrate: jest.fn(),
  };
  const searchService = {
    similaritySearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.message.findMany.mockResolvedValue([
      { role: 'human', content: '我买的蓝牙耳机降噪效果不好', metadata: null },
      { role: 'ai', content: '请提供订单号和商品状态', metadata: null },
    ]);
    orchestratorService.orchestrate.mockResolvedValue(COMPLETED_ORCHESTRATION);
    searchService.similaritySearch.mockResolvedValue([
      {
        id: 'chunk-1',
        documentId: 'doc-policy',
        content: '退货政策：自签收起 7 天内未拆封可无理由退货。',
        metadata: null,
        score: 0.92,
      },
    ]);
  });

  function createService() {
    return new AdvancedAnalysisService(
      prisma as never,
      orchestratorService as never,
      searchService as never,
    );
  }

  it('integrates history + RAG retrieval + multi-agent, persists messages, returns full report', async () => {
    const service = createService();

    const result = await service.analyze(USER_ID, CONVERSATION_ID, INPUT);

    // 语义检索按当前用户与输入触发
    expect(searchService.similaritySearch).toHaveBeenCalledWith(INPUT, USER_ID, 4);

    // 注入 Orchestrator 的结构化上下文同时包含：检索到的政策文档、历史、当前输入
    const orchestrateArg = orchestratorService.orchestrate.mock.calls[0][0] as {
      input: string;
      policyContext: string;
    };
    expect(orchestrateArg.policyContext).toContain('退货政策：自签收起 7 天内未拆封可无理由退货。');
    expect(orchestrateArg.input).toContain('human: 我买的蓝牙耳机降噪效果不好');
    expect(orchestrateArg.input).toContain(`当前输入：\n${INPUT}`);

    // 本轮 human 输入与 ai 报告写入 Message 表
    expect(prisma.message.create).toHaveBeenCalledTimes(2);

    // 返回完整结果
    expect(result.report).toBe('# 退货判断报告\n建议通过退货申请。');
    expect(result.usedAgents).toEqual([
      'extractAgent',
      'policyCheckAgent',
      'riskReviewAgent',
      'qaAgent',
      'summaryAgent',
    ]);
    expect(result.retrievedDocuments).toEqual([
      {
        chunkId: 'chunk-1',
        documentId: 'doc-policy',
        content: '退货政策：自签收起 7 天内未拆封可无理由退货。',
        score: 0.92,
      },
    ]);
  });

  it('returns a clarification report when orchestration needs more info', async () => {
    orchestratorService.orchestrate.mockResolvedValue({
      mode: 'clarification',
      clarificationQuestions: ['请提供订单号。'],
      usedAgents: ['extractAgent'],
      fallback: null,
      steps: [{ agent: 'extractAgent', output: '{"orderId":null}' }],
      graphTrace: [],
      report: '',
    } satisfies OrchestratorResult);
    const service = createService();

    const result = await service.analyze(USER_ID, CONVERSATION_ID, '帮我看看能不能退');

    expect(result.report).toBe('请补充信息：请提供订单号。');
    // 即便需澄清，本轮对话仍写入历史
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
  });
});
