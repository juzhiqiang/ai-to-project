import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';
import type { OrchestratorResult } from '../../src/llm/agents/orchestrator.service';

const SESSION_ID = 'session-ec-001';
const INPUT = '帮我判断一下能不能退，如果可以请告诉我下一步操作';

const COMPLETED_ORCHESTRATION: OrchestratorResult = {
  mode: 'completed',
  clarificationQuestions: [],
  usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
  fallback: null,
  steps: [
    {
      agent: 'extractAgent',
      output: JSON.stringify({
        orderId: 'EC20240315001',
        productId: 'P-BT-001',
        requestType: 'return',
        receivedDate: '昨天',
        isUnopened: true,
      }),
    },
    { agent: 'policyCheckAgent', output: '符合退货条件。' },
    { agent: 'riskReviewAgent', output: '低风险。' },
    { agent: 'qaAgent', output: 'Given 未拆封 When 申请退货 Then 进入退货流程' },
    { agent: 'summaryAgent', output: '# 退货判断报告\n建议通过退货申请。' },
  ],
  report: '# 退货判断报告\n建议通过退货申请。',
};

describe('AdvancedAnalysisService', () => {
  const memoryService = {
    getHistory: jest.fn(),
    appendMessage: jest.fn(async () => undefined),
  };
  const orchestratorService = {
    orchestrate: jest.fn(),
  };
  const filesystemService = {
    writeFile: jest.fn(async (path: string) => ({ path, written: true })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    memoryService.getHistory.mockResolvedValue([
      { type: 'human', content: '我买的蓝牙耳机降噪效果不好' },
      { type: 'ai', content: '请提供订单号和商品状态' },
      { type: 'human', content: '订单号 EC20240315001，昨天收到还没拆封' },
    ]);
    orchestratorService.orchestrate.mockResolvedValue(COMPLETED_ORCHESTRATION);
  });

  it('combines memory, multi-agent analysis, ticket writing, and memory append into one report', async () => {
    const service = new AdvancedAnalysisService(
      memoryService as never,
      orchestratorService as never,
      filesystemService as never,
    );

    await expect(service.analyze(SESSION_ID, INPUT)).resolves.toEqual({
      sessionId: SESSION_ID,
      input: INPUT,
      context: expect.stringContaining('human: 我买的蓝牙耳机降噪效果不好'),
      orchestration: COMPLETED_ORCHESTRATION,
      ticket: {
        path: 'tickets/EC20240315001-analysis.md',
        written: true,
      },
      memory: {
        appended: true,
      },
      report: '# 退货判断报告\n建议通过退货申请。',
    });

    expect(memoryService.getHistory).toHaveBeenCalledWith(SESSION_ID);
    expect(orchestratorService.orchestrate).toHaveBeenCalledWith(
      expect.stringContaining(`当前输入：\n${INPUT}`),
    );
    expect(orchestratorService.orchestrate).toHaveBeenCalledWith(expect.stringContaining('历史上下文：'));
    expect(filesystemService.writeFile).toHaveBeenCalledWith(
      'tickets/EC20240315001-analysis.md',
      '# 退货判断报告\n建议通过退货申请。',
    );
    expect(memoryService.appendMessage).toHaveBeenCalledWith(
      SESSION_ID,
      INPUT,
      '# 退货判断报告\n建议通过退货申请。',
    );
  });

  it('does not write a ticket when clarification is still required', async () => {
    const clarificationResult: OrchestratorResult = {
      mode: 'clarification',
      clarificationQuestions: ['请提供订单号。'],
      usedAgents: ['extractAgent'],
      fallback: null,
      steps: [{ agent: 'extractAgent', output: '{"orderId":null}' }],
      report: '',
    };
    orchestratorService.orchestrate.mockResolvedValue(clarificationResult);
    const service = new AdvancedAnalysisService(
      memoryService as never,
      orchestratorService as never,
      filesystemService as never,
    );

    const result = await service.analyze(SESSION_ID, '帮我看看能不能退');

    expect(result.ticket).toBeNull();
    expect(result.report).toBe('请补充信息：请提供订单号。');
    expect(filesystemService.writeFile).not.toHaveBeenCalled();
    expect(memoryService.appendMessage).toHaveBeenCalledWith(SESSION_ID, '帮我看看能不能退', '请补充信息：请提供订单号。');
  });
});
