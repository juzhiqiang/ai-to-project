import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { createSummarySubGraph } from '../../../src/llm/graph/summary-subgraph';

class FakeSummaryModel {
  public readonly seenMessages: BaseMessage[][] = [];
  private invokeIndex = 0;
  private criticIndex = 0;

  constructor(
    private readonly invokeResponses: AIMessage[],
    private readonly criticResponses: Array<{ pass: boolean; critique: string; issues?: string[] }>,
  ) {}

  public readonly invoke = jest.fn(async (messages: BaseMessage[]) => {
    this.seenMessages.push([...messages]);
    const response = this.invokeResponses[this.invokeIndex] ?? new AIMessage('');
    this.invokeIndex += 1;

    return response;
  });

  public readonly withStructuredOutput = jest.fn(() => ({
    invoke: jest.fn(async (_messages: BaseMessage[]) => {
      const response = this.criticResponses[this.criticIndex] ?? { pass: true, critique: '', issues: [] };
      this.criticIndex += 1;

      return response;
    }),
  }));
}

describe('summary critic-refine subgraph', () => {
  it('refines the summary until critic passes and records the loop trace', async () => {
    const graph = createSummarySubGraph();
    const graphTrace: string[] = [];
    const model = new FakeSummaryModel(
      [
        new AIMessage('# Requirement Report\n\n## Conflict Analysis\nOnly describes a conflict.'),
        new AIMessage(
          [
            '# Requirement Report',
            '## Requirement Summary',
            '## Conflict Analysis',
            'Conflict solution: merge SSO scope into the existing auth roadmap.',
            '## Technical Complexity',
            'Medium because auth integration depends on session updates.',
            '## Development Schedule',
            'Backend API depends on auth-service readiness; frontend depends on backend API completion.',
          ].join('\n'),
        ),
      ],
      [
        {
          pass: false,
          critique: 'Missing development schedule dependencies and concrete conflict solution.',
          issues: ['Missing schedule dependency', 'Conflict has no solution'],
        },
        { pass: true, critique: '', issues: [] },
      ],
    );

    const state = await graph.invoke(
      {
        summary: '',
        summaryDraft: '',
        critique: '',
        critiqueIssues: [],
        reviseCount: 0,
      },
      {
        context: {
          requirementAnalysis: {
            input: 'Analyze REQ-200 login and SSO capability',
            extractionText: '{"orderId":"REQ-200"}',
            analysisText: 'Feature breakdown: login and SSO capability.',
            riskReview: 'Risk: overlaps with existing auth roadmap.',
            qa: 'Given auth roadmap exists\nWhen adding SSO\nThen verify conflict resolution',
            summaryModel: model,
            graphTrace,
          },
        },
      } as any,
    );

    expect(state.summary).toContain('Development Schedule');
    expect(state.critique).toBe('');
    expect(state.critiqueIssues).toEqual([]);
    expect(state.reviseCount).toBe(1);
    expect(graphTrace.join(' -> ')).toBe('summary.actor -> summary.critic -> summary.refine -> summary.critic');
  });
});
