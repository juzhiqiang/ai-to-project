import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { createAnalysisSupervisorSubGraph, createFunctionalExpert } from '../../../src/llm/graph/experts';
import { createAnalysisTools } from '../../../src/llm/graph/analysis-tools';

class FakeBoundToolModel {
  public readonly seenMessages: BaseMessage[][] = [];
  private responseIndex = 0;

  constructor(private readonly responses: AIMessage[]) {}

  public readonly invoke = jest.fn(async (messages: BaseMessage[]) => {
    this.seenMessages.push([...messages]);
    const response = this.responses[this.responseIndex] ?? new AIMessage('');
    this.responseIndex += 1;
    return response;
  });
}

function createSupervisorModel(activeExperts: string[], boundModels: FakeBoundToolModel[]) {
  let bindIndex = 0;

  return {
    withStructuredOutput: jest.fn(() => ({
      invoke: jest.fn().mockResolvedValue({
        activeExperts,
        reasoning: 'selected by test supervisor',
      }),
    })),
    bindTools: jest.fn(() => {
      const model = boundModels[bindIndex];
      bindIndex += 1;
      return model ?? new FakeBoundToolModel([new AIMessage('unused')]);
    }),
  } as any;
}

describe('analysis supervisor experts', () => {
  it('lets an expert use tools internally and only writes its own output field', async () => {
    const searchRequirement = jest.fn().mockResolvedValue('REQ-100 detail');
    const model = {
      bindTools: jest.fn(
        () =>
          new FakeBoundToolModel([
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_req_lookup',
                  name: 'search_requirement',
                  args: { reqId: 'REQ-100' },
                  type: 'tool_call',
                },
              ],
            }),
            new AIMessage('功能专家结论：基于需求详情拆解用户资料编辑能力。'),
          ]),
      ),
    } as any;

    const graph = createFunctionalExpert(model, createAnalysisTools({ searchRequirement }));
    const state = await graph.invoke({
      messages: [new HumanMessage('分析 REQ-100 并补充方案')],
    } as any);

    expect(searchRequirement).toHaveBeenCalledWith('REQ-100');
    expect(state.functionalAnalysis).toContain('功能专家结论');
    expect((state as any).analysisResult).toBeUndefined();
  });

  it('routes to selected experts and aggregates only active expert outputs', async () => {
    const functional = new FakeBoundToolModel([new AIMessage('功能专家结论：拆分账号登录与资料维护。')]);
    const performance = new FakeBoundToolModel([new AIMessage('性能专家结论：不应该被执行。')]);
    const security = new FakeBoundToolModel([new AIMessage('安全专家结论：需要鉴权、会话和审计控制。')]);
    const compliance = new FakeBoundToolModel([new AIMessage('合规专家结论：不应该被执行。')]);
    const graphTrace: string[] = [];
    const graph = createAnalysisSupervisorSubGraph({
      model: createSupervisorModel(['functional', 'security'], [functional, performance, security, compliance]),
      tools: createAnalysisTools(),
      graphTrace,
    });

    const state = await graph.invoke({
      messages: [new HumanMessage('新增企业账号登录和单点登录能力')],
    } as any);

    expect(state.activeExperts).toEqual(['functional', 'security']);
    expect(functional.invoke).toHaveBeenCalled();
    expect(security.invoke).toHaveBeenCalled();
    expect(performance.invoke).not.toHaveBeenCalled();
    expect(compliance.invoke).not.toHaveBeenCalled();
    expect(state.analysisResult).toContain('功能专家结论');
    expect(state.analysisResult).toContain('安全专家结论');
    expect(state.analysisResult).not.toContain('性能专家结论');
    expect(state.analysisResult).not.toContain('合规专家结论');
    expect(graphTrace).toContain('supervisor');
    expect(graphTrace).toContain('aggregator');
  });
});
