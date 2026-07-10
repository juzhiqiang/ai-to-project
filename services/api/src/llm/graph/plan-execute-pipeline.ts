import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph, type Runtime } from '@langchain/langgraph';
import { z } from 'zod';
import type { CustomerServiceAgents } from '../agents/sub-agents';
import type { ChatModelLike } from '../model.factory';
import {
  runAnalysisGraph,
  type OrchestratorInput,
  type OrchestratorResult,
} from './requirement-analysis-graph';

const PIPELINE_NODE = {
  planner: 'planner',
  executor: 'executor',
  evaluator: 'evaluator',
  reflector: 'reflector',
} as const;

export const pipelinePlanSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.string().optional(),
        description: z.string(),
      }),
    )
    .min(1),
});

export const pipelineEvaluationSchema = z.object({
  pass: z.boolean(),
  reason: z.string().default(''),
  finalReport: z.string().default(''),
});

export const pipelineReflectionSchema = z.object({
  reflection: z.string(),
  revisedSteps: z
    .array(
      z.object({
        id: z.string().optional(),
        description: z.string(),
      }),
    )
    .min(1),
});

export interface PipelinePlanStep {
  id: string;
  description: string;
  done: boolean;
}

export interface PipelineStepResult {
  stepId: string;
  description: string;
  threadId: string;
  mode: OrchestratorResult['mode'];
  report: string;
  graphTrace: string[];
  usedAgents: string[];
  handoffReason?: string | null;
}

export interface PlanExecutePipelineResult {
  plan: PipelinePlanStep[];
  currentStepIndex: number;
  stepResults: Record<string, PipelineStepResult>;
  reflections: string[];
  retryCount: number;
  parentThreadId: string;
  finalReport: string;
  evaluationPassed: boolean;
  evaluationReason: string;
}

export interface PlanExecutePipelineInput extends OrchestratorInput {
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
  parentThreadId?: string;
}

interface PlanExecutePipelineRuntime {
  input: string;
  policyContext: string;
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
  parentThreadId: string;
}

export const PipelineState = Annotation.Root({
  plan: Annotation<PipelinePlanStep[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  currentStepIndex: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  stepResults: Annotation<Record<string, PipelineStepResult>>({
    value: (_current, update) => update,
    default: () => ({}),
  }),
  reflections: Annotation<string[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  retryCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  parentThreadId: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  finalReport: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  evaluationPassed: Annotation<boolean>({
    value: (_current, update) => update,
    default: () => false,
  }),
  evaluationReason: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
});

const PipelineContext = Annotation.Root({
  pipeline: Annotation<PlanExecutePipelineRuntime>(),
});

type PipelineStateValue = typeof PipelineState.State;
type PipelineStateUpdate = typeof PipelineState.Update;
type PipelineNodeRuntime = Runtime<typeof PipelineContext.State>;

export function createPlanExecutePipelineGraph() {
  return new StateGraph(PipelineState, PipelineContext)
    .addNode(PIPELINE_NODE.planner, plannerNode)
    .addNode(PIPELINE_NODE.executor, executorNode)
    .addNode(PIPELINE_NODE.evaluator, evaluatorNode)
    .addNode(PIPELINE_NODE.reflector, reflectorNode)
    .addEdge(START, PIPELINE_NODE.planner)
    .addEdge(PIPELINE_NODE.planner, PIPELINE_NODE.executor)
    .addConditionalEdges(PIPELINE_NODE.executor, routeAfterExecutor, [
      PIPELINE_NODE.executor,
      PIPELINE_NODE.evaluator,
    ])
    .addConditionalEdges(PIPELINE_NODE.evaluator, routeAfterEvaluator, [
      PIPELINE_NODE.reflector,
      END,
    ])
    .addEdge(PIPELINE_NODE.reflector, PIPELINE_NODE.executor)
    .compile();
}

export async function runPlanExecutePipeline(
  input: PlanExecutePipelineInput,
): Promise<PlanExecutePipelineResult> {
  const runtime = normalizePipelineInput(input);
  const graph = createPlanExecutePipelineGraph();
  const state = await graph.invoke(
    {
      plan: [],
      currentStepIndex: 0,
      stepResults: {},
      reflections: [],
      retryCount: 0,
      parentThreadId: runtime.parentThreadId,
      finalReport: '',
      evaluationPassed: false,
      evaluationReason: '',
    },
    { context: { pipeline: runtime } },
  );

  return {
    plan: state.plan,
    currentStepIndex: state.currentStepIndex,
    stepResults: state.stepResults,
    reflections: state.reflections,
    retryCount: state.retryCount,
    parentThreadId: state.parentThreadId,
    finalReport: state.finalReport,
    evaluationPassed: state.evaluationPassed,
    evaluationReason: state.evaluationReason,
  };
}

async function plannerNode(
  state: PipelineStateValue,
  runtimeConfig: PipelineNodeRuntime,
): Promise<PipelineStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  if (state.plan.length > 0) {
    return {};
  }

  const rawSteps = await invokeStructuredOrFallback(
    runtime.model,
    pipelinePlanSchema,
    buildPlannerMessages(runtime.input, runtime.policyContext),
    {
      steps: [{ id: 'step-1', description: runtime.input }],
    },
  );
  const parsed = pipelinePlanSchema.parse(rawSteps);

  return {
    plan: normalizePlan(parsed.steps),
    currentStepIndex: 0,
    stepResults: {},
    parentThreadId: runtime.parentThreadId,
  };
}

async function executorNode(
  state: PipelineStateValue,
  runtimeConfig: PipelineNodeRuntime,
): Promise<PipelineStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const step = state.plan[state.currentStepIndex];

  if (!step) {
    return {};
  }

  const threadId = `${state.parentThreadId || runtime.parentThreadId}:step-${state.currentStepIndex}`;
  const graphTrace: string[] = [];
  const result = await runAnalysisGraph({
    input: buildStepInput(runtime.input, step),
    policyContext: runtime.policyContext,
    agents: runtime.agents,
    model: runtime.model,
    graphTrace,
  });
  const updatedPlan = state.plan.map((item, index) =>
    index === state.currentStepIndex ? { ...item, done: true } : item,
  );

  return {
    plan: updatedPlan,
    currentStepIndex: state.currentStepIndex + 1,
    stepResults: {
      ...state.stepResults,
      [step.id]: {
        stepId: step.id,
        description: step.description,
        threadId,
        mode: result.mode,
        report: result.report,
        graphTrace: result.graphTrace ?? graphTrace,
        usedAgents: result.usedAgents,
        handoffReason: result.handoffReason ?? null,
      },
    },
  };
}

async function evaluatorNode(
  state: PipelineStateValue,
  runtimeConfig: PipelineNodeRuntime,
): Promise<PipelineStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const fallbackReport = buildCombinedReport(state);
  const rawEvaluation = await invokeStructuredOrFallback(
    runtime.model,
    pipelineEvaluationSchema,
    buildEvaluatorMessages(runtime.input, state, fallbackReport),
    {
      pass: true,
      reason: 'fallback evaluation passed',
      finalReport: fallbackReport,
    },
  );
  const evaluation = pipelineEvaluationSchema.parse(rawEvaluation);

  return {
    evaluationPassed: evaluation.pass,
    evaluationReason: evaluation.reason,
    finalReport: evaluation.finalReport.trim() || fallbackReport,
  };
}

async function reflectorNode(
  state: PipelineStateValue,
  runtimeConfig: PipelineNodeRuntime,
): Promise<PipelineStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const rawReflection = await invokeStructuredOrFallback(
    runtime.model,
    pipelineReflectionSchema,
    buildReflectorMessages(runtime.input, state),
    {
      reflection: 'fallback reflection: rerun the original plan once',
      revisedSteps: state.plan.map(({ id, description }) => ({ id, description })),
    },
  );
  const reflection = pipelineReflectionSchema.parse(rawReflection);

  return {
    plan: normalizePlan(reflection.revisedSteps),
    currentStepIndex: 0,
    stepResults: {},
    reflections: [...state.reflections, reflection.reflection],
    retryCount: state.retryCount + 1,
  };
}

function routeAfterExecutor(state: PipelineStateValue) {
  return state.currentStepIndex < state.plan.length
    ? PIPELINE_NODE.executor
    : PIPELINE_NODE.evaluator;
}

function routeAfterEvaluator(state: PipelineStateValue) {
  if (state.evaluationPassed || state.retryCount >= 1) {
    return END;
  }

  return PIPELINE_NODE.reflector;
}

function normalizePipelineInput(
  input: PlanExecutePipelineInput,
): PlanExecutePipelineRuntime {
  return {
    input: input.input,
    policyContext: input.policyContext?.trim() || '无相关政策文档',
    agents: input.agents,
    model: input.model,
    parentThreadId: input.parentThreadId?.trim() || `pipeline-${Date.now()}`,
  };
}

function normalizePlan(
  steps: Array<{ id?: string | null; description?: string | null }>,
): PipelinePlanStep[] {
  return steps.map((step, index) => ({
    id: normalizeStepId(step.id, index),
    description: step.description?.trim() || `执行子任务 ${index + 1}`,
    done: false,
  }));
}

function normalizeStepId(id: string | null | undefined, index: number) {
  const normalized = id?.trim();

  return normalized || `step-${index + 1}`;
}

function buildStepInput(input: string, step: PipelinePlanStep) {
  return [`父任务：${input}`, `当前子任务 ${step.id}：${step.description}`].join('\n\n');
}

function buildPlannerMessages(input: string, policyContext: string) {
  return [
    new SystemMessage(
      [
        '你是 Plan-and-Execute planner，负责把跨工单或跨需求分析拆成少量可独立执行的子任务。',
        '输出 steps 数组。每个 step 要有稳定 id 和清晰 description。',
        '不要超过 4 个步骤。',
      ].join('\n'),
    ),
    new HumanMessage([`任务：${input}`, `政策上下文：${policyContext}`].join('\n\n')),
  ];
}

function buildEvaluatorMessages(
  input: string,
  state: PipelineStateValue,
  fallbackReport: string,
) {
  return [
    new SystemMessage(
      [
        '你是 Plan-and-Execute evaluator，评估联合分析报告是否完整。',
        '必须判断 pass、说明 reason，并给出 finalReport。',
        '如果缺少跨步骤结论或冲突处理，pass=false。',
      ].join('\n'),
    ),
    new HumanMessage(
      [
        `原始任务：${input}`,
        `计划：${JSON.stringify(state.plan)}`,
        `步骤结果：${JSON.stringify(state.stepResults)}`,
        `候选总报告：${fallbackReport}`,
      ].join('\n\n'),
    ),
  ];
}

function buildReflectorMessages(input: string, state: PipelineStateValue) {
  return [
    new SystemMessage(
      [
        '你是 Reflexion reflector，负责分析上一次计划为什么没有通过评估。',
        '输出 reflection 和 revisedSteps。revisedSteps 会从第一步重新执行。',
        '只修订与失败原因相关的步骤。',
      ].join('\n'),
    ),
    new HumanMessage(
      [
        `原始任务：${input}`,
        `失败原因：${state.evaluationReason}`,
        `当前计划：${JSON.stringify(state.plan)}`,
        `步骤结果：${JSON.stringify(state.stepResults)}`,
      ].join('\n\n'),
    ),
  ];
}

function buildCombinedReport(state: PipelineStateValue) {
  const stepReports = state.plan.map((step) => {
    const result = state.stepResults[step.id];

    return [`## ${step.description}`, result?.report || '未返回报告'].join('\n');
  });

  return ['# Plan-and-Execute 联合分析报告', ...stepReports].join('\n\n');
}

async function invokeStructuredOrFallback<Schema extends z.ZodTypeAny>(
  model: ChatModelLike | undefined,
  schema: Schema,
  messages: Array<SystemMessage | HumanMessage>,
  fallback: z.infer<Schema>,
) {
  if (!model?.withStructuredOutput) {
    return fallback;
  }

  try {
    return await model.withStructuredOutput(schema).invoke(messages);
  } catch {
    return fallback;
  }
}

function getRuntime(runtimeConfig: PipelineNodeRuntime) {
  const runtime = runtimeConfig.context?.pipeline ?? runtimeConfig.configurable?.pipeline;

  if (!runtime) {
    throw new Error('Plan execute pipeline runtime is required');
  }

  return runtime;
}
