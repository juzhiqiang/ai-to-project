import { Annotation, END, MessagesAnnotation, START, StateGraph, type Runtime } from '@langchain/langgraph';
import type { CustomerServiceAgentName, CustomerServiceAgents } from '../agents/sub-agents';

const REQUIRED_EXTRACTION_FIELDS = ['orderId', 'requestType', 'receivedDate', 'isUnopened'] as const;
const GRAPH_NODE = {
  extract: 'extract',
  clarify: 'clarify',
  analysis: 'analysis_step',
  risk: 'risk_step',
  summary: 'summary_step',
} as const;

export interface CustomerServiceExtraction {
  orderId?: string | null;
  productId?: string | null;
  requestType?: string | null;
  receivedDate?: string | null;
  isUnopened?: boolean | null;
}

export interface AgentStep {
  agent: CustomerServiceAgentName;
  output: string;
}

export interface OrchestratorResult {
  mode: 'completed' | 'clarification' | 'fallback';
  clarificationQuestions: string[];
  usedAgents: CustomerServiceAgentName[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  report: string;
}

export interface OrchestratorInput {
  input: string;
  policyContext?: string;
}

export interface RequirementAnalysisGraphInput extends OrchestratorInput {
  agents: CustomerServiceAgents;
}

export interface RequirementClarification {
  questions: string[];
}

interface RequirementAnalysisRuntime {
  input: string;
  policyContext: string;
  agents: CustomerServiceAgents;
  steps: AgentStep[];
}

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  extracted: Annotation<CustomerServiceExtraction | null>(),
  clarified: Annotation<RequirementClarification | null>(),
  analysis: Annotation<string | null>(),
  risk: Annotation<string | null>(),
  summary: Annotation<string | null>(),
});

const RequirementAnalysisContext = Annotation.Root({
  requirementAnalysis: Annotation<RequirementAnalysisRuntime>(),
});

export type RequirementAnalysisStateValue = typeof RequirementAnalysisState.State;
type RequirementAnalysisStateUpdate = typeof RequirementAnalysisState.Update;
type RequirementAnalysisNodeRuntime = Runtime<typeof RequirementAnalysisContext.State>;

export function createAnalysisGraph() {
  return new StateGraph(RequirementAnalysisState, RequirementAnalysisContext)
    .addNode(GRAPH_NODE.extract, extractNode)
    .addNode(GRAPH_NODE.clarify, clarifyNode)
    .addNode(GRAPH_NODE.analysis, analysisNode)
    .addNode(GRAPH_NODE.risk, riskNode)
    .addNode(GRAPH_NODE.summary, summaryNode)
    .addEdge(START, GRAPH_NODE.extract)
    .addEdge(GRAPH_NODE.extract, GRAPH_NODE.clarify)
    .addEdge(GRAPH_NODE.clarify, GRAPH_NODE.analysis)
    .addEdge(GRAPH_NODE.analysis, GRAPH_NODE.risk)
    .addEdge(GRAPH_NODE.risk, GRAPH_NODE.summary)
    .addEdge(GRAPH_NODE.summary, END)
    .compile();
}

export async function runAnalysisGraph(input: RequirementAnalysisGraphInput): Promise<OrchestratorResult> {
  const runtime = normalizeGraphInput(input);

  try {
    const graph = createAnalysisGraph();
    const state = await graph.invoke(
      { messages: [] },
      { context: { requirementAnalysis: runtime } },
    );

    return buildResult(state, runtime.steps);
  } catch {
    return {
      mode: 'fallback',
      clarificationQuestions: [],
      usedAgents: runtime.steps.map((step) => step.agent),
      fallback: 'manual_review',
      steps: runtime.steps,
      report: '',
    };
  }
}

async function extractNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const extractionOutput = await runtime.agents.extractAgent.invoke({ input: runtime.input });
  const extraction = completeExtraction(parseExtraction(extractionOutput), runtime.input);

  runtime.steps.push({ agent: 'extractAgent', output: JSON.stringify(extraction) });

  return { extracted: extraction };
}

function clarifyNode(state: RequirementAnalysisStateValue): RequirementAnalysisStateUpdate {
  const clarificationQuestions = buildClarificationQuestions(state.extracted ?? {});

  return {
    clarified: { questions: clarificationQuestions },
  };
}

async function analysisNode(
  state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  if (hasClarificationQuestions(state)) {
    return { analysis: null };
  }

  const extraction = ensureExtraction(state.extracted);
  const policyCheck = await runtime.agents.policyCheckAgent.invoke({
    extraction: JSON.stringify(extraction),
    policyContext: runtime.policyContext,
  });

  return { analysis: policyCheck };
}

async function riskNode(
  state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  if (hasClarificationQuestions(state)) {
    return { risk: null };
  }

  const extraction = ensureExtraction(state.extracted);
  const policyCheck = ensureText(state.analysis, 'policyCheckAgent output is required before risk review');
  const riskReview = await runtime.agents.riskReviewAgent.invoke({
    input: runtime.input,
    extraction: JSON.stringify(extraction),
    policyContext: runtime.policyContext,
  });

  runtime.steps.push(
    { agent: 'policyCheckAgent', output: policyCheck },
    { agent: 'riskReviewAgent', output: riskReview },
  );

  return { risk: riskReview };
}

async function summaryNode(
  state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  if (hasClarificationQuestions(state)) {
    return { summary: '' };
  }

  const extraction = ensureExtraction(state.extracted);
  const extractionText = JSON.stringify(extraction);
  const policyCheck = ensureText(state.analysis, 'policyCheckAgent output is required before summary');
  const riskReview = ensureText(state.risk, 'riskReviewAgent output is required before summary');
  const qa = await runtime.agents.qaAgent.invoke({
    extraction: extractionText,
    policyContext: runtime.policyContext,
    policyCheck,
    riskReview,
  });
  runtime.steps.push({ agent: 'qaAgent', output: qa });

  const report = await runtime.agents.summaryAgent.invoke({
    input: runtime.input,
    extraction: extractionText,
    policyContext: runtime.policyContext,
    policyCheck,
    riskReview,
    qa,
  });
  runtime.steps.push({ agent: 'summaryAgent', output: report });

  return { summary: report };
}

function normalizeGraphInput(input: RequirementAnalysisGraphInput): RequirementAnalysisRuntime {
  return {
    input: input.input,
    policyContext: input.policyContext?.trim() || '无相关政策文档',
    agents: input.agents,
    steps: [],
  };
}

function buildResult(state: RequirementAnalysisStateValue, steps: AgentStep[]): OrchestratorResult {
  const clarificationQuestions = state.clarified?.questions ?? [];

  if (clarificationQuestions.length > 0) {
    return {
      mode: 'clarification',
      clarificationQuestions,
      usedAgents: steps.map((step) => step.agent),
      fallback: null,
      steps,
      report: '',
    };
  }

  return {
    mode: 'completed',
    clarificationQuestions: [],
    usedAgents: steps.map((step) => step.agent),
    fallback: null,
    steps,
    report: state.summary ?? '',
  };
}

function getRuntime(runtimeConfig: RequirementAnalysisNodeRuntime): RequirementAnalysisRuntime {
  const runtime = runtimeConfig.context?.requirementAnalysis ?? runtimeConfig.configurable?.requirementAnalysis;

  if (!runtime) {
    throw new Error('Requirement analysis graph runtime is required');
  }

  return runtime;
}

function parseExtraction(output: string): CustomerServiceExtraction {
  const jsonText = stripJsonFence(output);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('extractAgent output must be a JSON object');
  }

  return parsed as CustomerServiceExtraction;
}

function completeExtraction(extraction: CustomerServiceExtraction, input: string): CustomerServiceExtraction {
  return {
    ...extraction,
    requestType: hasExtractionValue(extraction.requestType) ? extraction.requestType : inferRequestType(input),
    receivedDate: hasExtractionValue(extraction.receivedDate) ? extraction.receivedDate : inferReceivedDate(input),
    isUnopened: hasExtractionValue(extraction.isUnopened) ? extraction.isUnopened : inferIsUnopened(input),
  };
}

function inferRequestType(input: string) {
  if (/(退货|退掉|退回|能不能退|可以退)/.test(input)) {
    return 'return';
  }

  if (/(退款|退钱)/.test(input)) {
    return 'refund';
  }

  if (/(换货|更换|换一个)/.test(input)) {
    return 'exchange';
  }

  return null;
}

function inferReceivedDate(input: string) {
  const relativeBeforeVerb = input.match(/(今天|昨天|前天|刚刚|刚|当天).{0,12}(收到|签收|收货)/);
  const verbBeforeRelative = input.match(/(收到|签收|收货).{0,12}(今天|昨天|前天|刚刚|刚|当天)/);
  const absoluteDate = input.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}日)/);

  return relativeBeforeVerb?.[1] ?? verbBeforeRelative?.[2] ?? absoluteDate?.[1] ?? null;
}

function inferIsUnopened(input: string) {
  if (/(没拆封|未拆封|没有拆封|还没拆|全新未拆)/.test(input)) {
    return true;
  }

  if (/(已拆封|拆开了|拆过|使用过|用过)/.test(input)) {
    return false;
  }

  return null;
}

function stripJsonFence(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced ? fenced[1].trim() : trimmed;
}

function buildClarificationQuestions(extraction: CustomerServiceExtraction) {
  return REQUIRED_EXTRACTION_FIELDS.flatMap((field) => {
    if (hasExtractionValue(extraction[field])) {
      return [];
    }

    return [questionForField(field)];
  });
}

function hasExtractionValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function questionForField(field: (typeof REQUIRED_EXTRACTION_FIELDS)[number]) {
  const questions = {
    orderId: '请提供订单号。',
    requestType: '请说明诉求类型，例如退货、退款或换货。',
    receivedDate: '请说明收货日期或签收时间。',
    isUnopened: '请确认商品是否未拆封。',
  };

  return questions[field];
}

function hasClarificationQuestions(state: RequirementAnalysisStateValue) {
  return (state.clarified?.questions.length ?? 0) > 0;
}

function ensureExtraction(extraction: CustomerServiceExtraction | null | undefined): CustomerServiceExtraction {
  if (!extraction) {
    throw new Error('extractAgent output is required');
  }

  return extraction;
}

function ensureText(value: string | null | undefined, message: string) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
