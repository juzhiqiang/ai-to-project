import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { OrchestratorService } from '../../../src/llm/agents/orchestrator.service';
import * as requirementAnalysisGraph from '../../../src/llm/graph/requirement-analysis-graph';
import type { ChatModelFactory } from '../../../src/llm/model.factory';

const CUSTOMER_INPUT = '订单 EC20240315001，昨天签收，商品未拆封，我想申请退货。';

type AgentName = 'extractAgent' | 'riskReviewAgent' | 'qaAgent' | 'summaryAgent';

interface ServiceModelOptions {
  agentOutputs: Partial<Record<AgentName, string>>;
  analysisResponses?: AIMessage[];
  throwOnAgents?: AgentName[];
}

class FakeBoundToolModel {
  private responseIndex = 0;

  constructor(private readonly responses: AIMessage[]) {}

  public readonly invoke = jest.fn(async (_messages: BaseMessage[]) => {
    const response = this.responses[this.responseIndex] ?? new AIMessage('');
    this.responseIndex += 1;
    return response;
  });
}

function createAnalyzeServiceFactory(options: ServiceModelOptions) {
  const seenPrompts: Record<string, string[]> = {};
  const throwOnAgents = new Set(options.throwOnAgents ?? []);
  const candidateOrder: AgentName[] = ['extractAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'];
  let agentIndex = 0;

  const runnable = RunnableLambda.from(async (promptValue: BaseMessage[] | { toChatMessages: () => BaseMessage[] }) => {
    const isDirectChatMessages = Array.isArray(promptValue);
    const messages = isDirectChatMessages ? promptValue : promptValue.toChatMessages();
    const system = String(messages[0]?.content ?? '');
    const matchedAgent = isDirectChatMessages
      ? 'summaryAgent'
      : candidateOrder.find((agentName) => system.includes(agentName)) ?? candidateOrder[agentIndex];

    if (!matchedAgent) {
      throw new Error(`Unexpected prompt: ${system}`);
    }

    if (throwOnAgents.has(matchedAgent)) {
      throw new Error(`Injected failure for ${matchedAgent}`);
    }

    const output = options.agentOutputs[matchedAgent];

    if (!output) {
      throw new Error(`Missing scripted output for ${matchedAgent}`);
    }

    seenPrompts[matchedAgent] = messages.map((message) => String(message.content));
    agentIndex += 1;
    return new AIMessage(output);
  }) as any;

  runnable.bindTools = jest.fn(
    () =>
      new FakeBoundToolModel(
        options.analysisResponses ?? [
          new AIMessage(
            [
              '功能分解：退货资格判断。',
              '用户故事：作为客服，我希望快速完成退货资格分析。',
              '验收标准：明确是否可退和后续动作。',
              '技术复杂度评估：低。',
            ].join('\n'),
          ),
        ],
      ),
  );

  let structuredInvokeIndex = 0;

  runnable.withStructuredOutput = jest.fn(() => ({
    invoke: jest.fn(async () => {
      const currentIndex = structuredInvokeIndex;
      structuredInvokeIndex += 1;

      if (currentIndex === 0) {
        return { action: 'handoff_to_analysis', reason: 'service analyze flow' };
      }

      return { pass: true, critique: '', issues: [] };
    }),
  }));

  return {
    seenPrompts,
    model: runnable,
    factory: (() => runnable) as unknown as ChatModelFactory,
  };
}

describe('OrchestratorService', () => {
  it('passes the provided policy context into the downstream qa and summary agents', async () => {
    const { factory, seenPrompts } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: '昨天',
          isUnopened: true,
        }),
        riskReviewAgent: '低风险。',
        qaAgent: 'Given policy allows unopened returns\nWhen user asks for return\nThen allow return flow',
        summaryAgent: '# 退货判断报告\n引用 return-policy.md，建议允许用户申请退货。',
      },
    });
    const service = new OrchestratorService(factory);

    await service.orchestrate({
      input: CUSTOMER_INPUT,
      policyContext: '【参考文档 1】return-policy.md：签收 7 天内未拆封可退货。',
    } as any);

    expect(seenPrompts.qaAgent.join('\n')).toContain('return-policy.md：签收 7 天内未拆封可退货');
    expect(seenPrompts.summaryAgent.join('\n')).toContain('return-policy.md：签收 7 天内未拆封可退货');
  });

  it('runs the analyze workflow and returns a final report after the analysis subgraph', async () => {
    const { factory } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: '昨天',
          isUnopened: true,
        }),
        riskReviewAgent: '风险较低，但需要以订单系统时间为准。',
        qaAgent: 'Given 用户已签收且未拆封\nWhen 用户申请退货\nThen 客服应允许进入退货流程',
        summaryAgent: '# 退货判断报告\n建议允许用户发起退货申请。',
      },
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate(CUSTOMER_INPUT);

    expect(result).toEqual(expect.objectContaining({
      intent: 'analyze',
      reasoning: 'service analyze flow',
      handoffReason: 'service analyze flow',
      queryResponse: null,
      chatResponse: null,
      mode: 'completed',
      clarificationQuestions: [],
      usedAgents: ['extractAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
      fallback: null,
      steps: [
        expect.objectContaining({ agent: 'extractAgent', output: expect.stringContaining('EC20240315001') }),
        expect.objectContaining({ agent: 'riskReviewAgent', output: expect.stringContaining('风险') }),
        expect.objectContaining({ agent: 'qaAgent', output: expect.stringContaining('Given') }),
        expect.objectContaining({ agent: 'summaryAgent', output: expect.stringContaining('退货判断报告') }),
      ],
      report: '# 退货判断报告\n建议允许用户发起退货申请。',
    }));
  });

  it('stops after extraction and asks clarification questions when key fields are missing', async () => {
    const { factory } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: null,
          productId: null,
          requestType: 'return',
          receivedDate: null,
          isUnopened: null,
        }),
      },
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate('我想退货');

    expect(result.mode).toBe('clarification');
    expect(result.usedAgents).toEqual(['extractAgent']);
    expect(result.fallback).toBeNull();
    expect(result.report).toBe('');
    expect(result.clarificationQuestions).toEqual([
      '请提供订单号。',
      '请说明收货日期或签收时间。',
      '请确认商品是否未拆封。',
    ]);
  });

  it('continues when receivedDate is missing from extraction but present in the input text', async () => {
    const { factory } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: null,
          isUnopened: true,
        }),
        riskReviewAgent: '低风险。',
        qaAgent: 'Given 昨天签收且未拆封\nWhen 用户申请退货\nThen 客服应进入退货流程',
        summaryAgent: '# 退货判断报告\n建议进入退货流程。',
      },
    });
    const service = new OrchestratorService(factory);

    const result = await service.orchestrate('订单号 EC20240315001，商品还没拆封，是昨天签收的，想知道能不能退。');

    expect(result.mode).toBe('completed');
    expect(result.clarificationQuestions).not.toContain('请说明收货日期或签收时间。');
    expect(result.usedAgents).toEqual(['extractAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent']);
  });

  it('falls back to manual review when a downstream agent throws', async () => {
    const { factory } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: '昨天',
          isUnopened: true,
        }),
        riskReviewAgent: 'unused',
      },
      throwOnAgents: ['riskReviewAgent'],
    });
    const service = new OrchestratorService(factory);

    await expect(service.orchestrate(CUSTOMER_INPUT)).resolves.toEqual(
      expect.objectContaining({
        mode: 'fallback',
        fallback: 'manual_review',
        report: '',
        usedAgents: ['extractAgent'],
        steps: [expect.objectContaining({ agent: 'extractAgent' })],
      }),
    );
  });

  it('passes the chat model through to the analysis graph for routing decisions', async () => {
    const { factory, model } = createAnalyzeServiceFactory({
      agentOutputs: {
        extractAgent: JSON.stringify({
          orderId: 'EC20240315001',
          productId: 'P-BT-001',
          requestType: 'return',
          receivedDate: '昨天',
          isUnopened: true,
        }),
      },
    });
    const service = new OrchestratorService(factory);
    const spy = jest.spyOn(requirementAnalysisGraph, 'runAnalysisGraph').mockResolvedValue({
      mode: 'completed',
      clarificationQuestions: [],
      usedAgents: [],
      fallback: null,
      steps: [],
      graphTrace: [],
      report: '',
    });

    try {
      await service.orchestrate({
        input: '查询 REQ-20240315-001 的当前状态',
        policyContext: '无相关政策文档',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: '查询 REQ-20240315-001 的当前状态',
          policyContext: '无相关政策文档',
          agents: expect.any(Object),
          model,
        }),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
