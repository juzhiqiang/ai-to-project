import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph, type Runtime } from '@langchain/langgraph';
import { z } from 'zod';

export const MAX_SUMMARY_REVISE_COUNT = 2;

const summaryCriticSchema = z.object({
  pass: z.boolean(),
  critique: z.string().default(''),
  issues: z.array(z.string()).optional().default([]),
});

export interface SummaryModelLike {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
  withStructuredOutput<Schema>(schema: Schema): {
    invoke(messages: BaseMessage[]): Promise<unknown>;
  };
}

export interface SummarySubgraphRuntime {
  input: string;
  policyContext?: string;
  extractionText: string;
  analysisText: string;
  riskReview: string;
  qa: string;
  summaryModel: SummaryModelLike;
  graphTrace?: string[];
}

export const SummarySubgraphState = Annotation.Root({
  summary: Annotation<string | null>({
    value: (_current, update) => update,
    default: () => null,
  }),
  summaryDraft: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  critique: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  critiqueIssues: Annotation<string[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  reviseCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
});

const SummarySubgraphContext = Annotation.Root({
  requirementAnalysis: Annotation<SummarySubgraphRuntime>(),
});

type SummarySubgraphStateValue = typeof SummarySubgraphState.State;
type SummarySubgraphStateUpdate = typeof SummarySubgraphState.Update;
type SummarySubgraphNodeRuntime = Runtime<typeof SummarySubgraphContext.State>;

export function createSummarySubGraph() {
  return new StateGraph(SummarySubgraphState, SummarySubgraphContext)
    .addNode('actor', actorNode)
    .addNode('critic', criticNode)
    .addNode('refine', refineNode)
    .addEdge(START, 'actor')
    .addEdge('actor', 'critic')
    .addConditionalEdges('critic', shouldRefine, ['refine', END])
    .addEdge('refine', 'critic')
    .compile();
}

async function actorNode(
  _state: SummarySubgraphStateValue,
  runtimeConfig: SummarySubgraphNodeRuntime,
): Promise<SummarySubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'summary.actor');

  const response = await runtime.summaryModel.invoke([
    new SystemMessage(
      [
        'You are a senior requirement analyst. Generate a complete Markdown analysis report.',
        'The report must include: Requirement Summary, Functional Breakdown, Conflict Analysis, Technical Complexity, and Development Schedule.',
        'Conflict Analysis must include concrete resolution proposals when conflicts exist.',
        'Development Schedule must name phase dependencies, not only dates or durations.',
      ].join('\n'),
    ),
    new HumanMessage(
      [
        `Original requirement: ${runtime.input}`,
        `Policy context: ${runtime.policyContext?.trim() || 'No related policy docs'}`,
        `Extraction: ${runtime.extractionText}`,
        `Analysis: ${runtime.analysisText}`,
        `Risk review: ${runtime.riskReview}`,
        `QA criteria: ${runtime.qa}`,
      ].join('\n\n'),
    ),
  ]);
  const summary = messageContentToText(response.content);

  return {
    summary,
    summaryDraft: summary,
    critique: '',
    critiqueIssues: [],
    reviseCount: 0,
  };
}

async function criticNode(
  state: SummarySubgraphStateValue,
  runtimeConfig: SummarySubgraphNodeRuntime,
): Promise<SummarySubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'summary.critic');

  const structuredModel = runtime.summaryModel.withStructuredOutput(summaryCriticSchema);
  const parsed = summaryCriticSchema.parse(
    await structuredModel.invoke([
      new SystemMessage(
        [
          'You are a strict but practical requirement report reviewer.',
          'Pass only when the report has the required sections, schedule dependencies, conflict resolutions, and no major logical contradictions.',
          'If it fails, return the most important one or two actionable issues.',
          'Do not over-criticize wording or style.',
        ].join('\n'),
      ),
      new HumanMessage(`Report to review:\n\n${state.summary ?? ''}`),
    ]),
  );

  return {
    critique: parsed.pass ? '' : parsed.critique,
    critiqueIssues: parsed.pass ? [] : parsed.issues,
  };
}

async function refineNode(
  state: SummarySubgraphStateValue,
  runtimeConfig: SummarySubgraphNodeRuntime,
): Promise<SummarySubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'summary.refine');

  const response = await runtime.summaryModel.invoke([
    new SystemMessage(
      [
        'You are a requirement analyst refining an existing report from reviewer feedback.',
        'Only fix the criticized parts. Preserve correct sections, structure, and tone.',
        'Do not delete correct content. Do not introduce unrelated new scope.',
      ].join('\n'),
    ),
    new HumanMessage(
      [
        `Original requirement: ${runtime.input}`,
        `Current report:\n${state.summary ?? ''}`,
        `Critique:\n${state.critique}`,
        `Issues:\n${state.critiqueIssues.join('\n')}`,
      ].join('\n\n'),
    ),
  ]);

  return {
    summary: messageContentToText(response.content),
    reviseCount: state.reviseCount + 1,
  };
}

function shouldRefine(state: SummarySubgraphStateValue) {
  if (state.reviseCount >= MAX_SUMMARY_REVISE_COUNT) {
    return END;
  }

  if (!state.critique.trim()) {
    return END;
  }

  return 'refine';
}

function getRuntime(runtimeConfig: SummarySubgraphNodeRuntime): SummarySubgraphRuntime {
  const runtime = runtimeConfig.context?.requirementAnalysis ?? runtimeConfig.configurable?.requirementAnalysis;

  if (!runtime?.summaryModel) {
    throw new Error('Summary subgraph runtime with a summary model is required');
  }

  return runtime;
}

function pushTrace(runtime: SummarySubgraphRuntime, nodeName: string) {
  runtime.graphTrace?.push(nodeName);
}

function messageContentToText(content: unknown) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }

  return String(content ?? '');
}
