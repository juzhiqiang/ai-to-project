import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { Annotation, END, MessagesAnnotation, START, StateGraph, type Runtime } from '@langchain/langgraph';
import { z } from 'zod';
import type { CustomerServiceAgentName, CustomerServiceAgents } from '../agents/sub-agents';
import type { ChatModelLike } from '../model.factory';

const REQUIRED_EXTRACTION_FIELDS = ['orderId', 'requestType', 'receivedDate', 'isUnopened'] as const;
const INTENTS = ['analyze', 'query', 'chat'] as const;
const GRAPH_NODE = {
  classifier: 'classifier',
  extract: 'extract',
  clarify: 'clarify',
  analysis: 'analysis_step',
  risk: 'risk_step',
  summary: 'summary_step',
  queryHandler: 'queryHandler',
  chatHandler: 'chatHandler',
} as const;

const intentSchema = z.object({
  intent: z.enum(INTENTS),
  reasoning: z.string(),
});

export type RequirementIntent = (typeof INTENTS)[number];
export type RequirementAnalysisStepName = CustomerServiceAgentName | 'classifier' | 'queryHandler' | 'chatHandler';

export interface CustomerServiceExtraction {
  orderId?: string | null;
  productId?: string | null;
  requestType?: string | null;
  receivedDate?: string | null;
  isUnopened?: boolean | null;
}

export interface AgentStep {
  agent: RequirementAnalysisStepName;
  output: string;
}

export interface OrchestratorResult {
  mode: 'completed' | 'clarification' | 'fallback';
  clarificationQuestions: string[];
  usedAgents: RequirementAnalysisStepName[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  report: string;
  intent?: RequirementIntent;
  reasoning?: string | null;
  queryResponse?: string | null;
  chatResponse?: string | null;
}

export interface OrchestratorInput {
  input: string;
  policyContext?: string;
}

export interface RequirementAnalysisGraphInput extends OrchestratorInput {
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
}

export interface RequirementClarification {
  questions: string[];
}

interface RequirementAnalysisRuntime {
  input: string;
  policyContext: string;
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
  steps: AgentStep[];
}

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<RequirementIntent>({
    value: (_current, update) => update,
    default: () => 'analyze',
  }),
  reasoning: Annotation<string | null>(),
  extracted: Annotation<CustomerServiceExtraction | null>(),
  clarified: Annotation<RequirementClarification | null>(),
  analysis: Annotation<string | null>(),
  risk: Annotation<string | null>(),
  summary: Annotation<string | null>(),
  queryResponse: Annotation<string | null>(),
  chatResponse: Annotation<string | null>(),
});

const RequirementAnalysisContext = Annotation.Root({
  requirementAnalysis: Annotation<RequirementAnalysisRuntime>(),
});

export type RequirementAnalysisStateValue = typeof RequirementAnalysisState.State;
type RequirementAnalysisStateUpdate = typeof RequirementAnalysisState.Update;
type RequirementAnalysisNodeRuntime = Runtime<typeof RequirementAnalysisContext.State>;

export function createAnalysisGraph() {
  return new StateGraph(RequirementAnalysisState, RequirementAnalysisContext)
    .addNode(GRAPH_NODE.classifier, classifierNode)
    .addNode(GRAPH_NODE.extract, extractNode)
    .addNode(GRAPH_NODE.clarify, clarifyNode)
    .addNode(GRAPH_NODE.analysis, analysisNode)
    .addNode(GRAPH_NODE.risk, riskNode)
    .addNode(GRAPH_NODE.summary, summaryNode)
    .addNode(GRAPH_NODE.queryHandler, queryHandlerNode)
    .addNode(GRAPH_NODE.chatHandler, chatHandlerNode)
    .addEdge(START, GRAPH_NODE.classifier)
    .addConditionalEdges(GRAPH_NODE.classifier, routeByIntent, [
      GRAPH_NODE.extract,
      GRAPH_NODE.queryHandler,
      GRAPH_NODE.chatHandler,
    ])
    .addEdge(GRAPH_NODE.extract, GRAPH_NODE.clarify)
    .addEdge(GRAPH_NODE.clarify, GRAPH_NODE.analysis)
    .addEdge(GRAPH_NODE.analysis, GRAPH_NODE.risk)
    .addEdge(GRAPH_NODE.risk, GRAPH_NODE.summary)
    .addEdge(GRAPH_NODE.summary, END)
    .addEdge(GRAPH_NODE.queryHandler, END)
    .addEdge(GRAPH_NODE.chatHandler, END)
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

async function classifierNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  try {
    if (runtime.model?.withStructuredOutput) {
      const structuredModel = runtime.model.withStructuredOutput(intentSchema);
      const result = intentSchema.parse(await structuredModel.invoke(buildClassifierMessages(runtime.input)));

      return {
        intent: result.intent,
        reasoning: result.reasoning,
      };
    }
  } catch {
    // Classification must never block the graph; deterministic routing keeps the request moving.
  }

  const fallback = classifyIntentByRules(runtime.input);

  return fallback;
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

async function queryHandlerNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const response = await invokeResponseModel(runtime.model, [
    new SystemMessage('你是需求查询助手。请根据用户输入简洁回答需求状态、进度、报告或历史分析查询。'),
    new HumanMessage(runtime.input),
  ]);

  runtime.steps.push({ agent: 'queryHandler', output: response });

  return {
    queryResponse: response,
    summary: response,
  };
}

async function chatHandlerNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const response = await invokeResponseModel(runtime.model, [
    new SystemMessage('你是友好的AI助手。请自然、简洁地回应用户闲聊。'),
    new HumanMessage(runtime.input),
  ]);

  runtime.steps.push({ agent: 'chatHandler', output: response });

  return {
    chatResponse: response,
    summary: response,
  };
}

function normalizeGraphInput(input: RequirementAnalysisGraphInput): RequirementAnalysisRuntime {
  return {
    input: input.input,
    policyContext: input.policyContext?.trim() || '无相关政策文档',
    agents: input.agents,
    model: input.model,
    steps: [],
  };
}

function buildResult(state: RequirementAnalysisStateValue, steps: AgentStep[]): OrchestratorResult {
  const clarificationQuestions = state.clarified?.questions ?? [];
  const base = {
    intent: state.intent,
    reasoning: state.reasoning ?? null,
    queryResponse: state.queryResponse ?? null,
    chatResponse: state.chatResponse ?? null,
  };

  if (clarificationQuestions.length > 0) {
    return {
      ...base,
      mode: 'clarification',
      clarificationQuestions,
      usedAgents: steps.map((step) => step.agent),
      fallback: null,
      steps,
      report: '',
    };
  }

  return {
    ...base,
    mode: 'completed',
    clarificationQuestions: [],
    usedAgents: steps.map((step) => step.agent),
    fallback: null,
    steps,
    report: state.summary ?? '',
  };
}

function routeByIntent(state: RequirementAnalysisStateValue) {
  if (state.intent === 'query') {
    return GRAPH_NODE.queryHandler;
  }

  if (state.intent === 'chat') {
    return GRAPH_NODE.chatHandler;
  }

  return GRAPH_NODE.extract;
}

function buildClassifierMessages(input: string): BaseMessage[] {
  return [
    new SystemMessage(
      [
        '你是需求请求意图分类器。请只判断用户当前请求属于 analyze、query、chat 三类之一。',
        'analyze：用户提出新需求、描述功能、请求评估、要求分析可行性或风险。例如：分析需求 REQ-20240315-001：开发在线问卷系统。',
        'query：用户查询已有需求、需求编号、状态、进度、报告、历史分析结果。例如：查询 REQ-20240315-001 的当前状态。',
        'chat：用户只是问候、寒暄、闲聊，未提出需求分析或查询。例如：你好，今天天气不错。',
        '边界情况：像“查询 REQ-20240315-001 的风险分析报告”应判为 query，因为用户是在查已有报告。',
        '优先级：有明确查询词和需求编号时优先 query；纯闲聊优先 chat；默认 analyze。',
        '输出必须包含 intent 和 reasoning。',
      ].join('\n'),
    ),
    new HumanMessage(input),
  ];
}

function classifyIntentByRules(input: string): { intent: RequirementIntent; reasoning: string } {
  if (isQueryIntent(input)) {
    return { intent: 'query', reasoning: 'fallback: matched request id with query/status/report keywords' };
  }

  if (isChatIntent(input)) {
    return { intent: 'chat', reasoning: 'fallback: matched greeting or small-talk keywords' };
  }

  return { intent: 'analyze', reasoning: 'fallback: defaulted to analyze' };
}

function isQueryIntent(input: string) {
  return hasRequirementId(input) && /(查询|查看|看看|状态|进度|报告|结果|当前|如何|有没有)/i.test(input);
}

function isChatIntent(input: string) {
  return /^(你好|您好|嗨|hi|hello|hey|早上好|晚上好)[，,！!\s]*(今天天气不错|在吗|谢谢|辛苦了)?[。.!！\s]*$/i.test(input.trim());
}

function hasRequirementId(input: string) {
  return /\bREQ-\d{8}-\d{3,}\b/i.test(input);
}

async function invokeResponseModel(model: ChatModelLike | undefined, messages: BaseMessage[]) {
  if (!model) {
    throw new Error('Chat model is required for routed response');
  }

  const response = await model.invoke(messages);

  return messageContentToText(response.content);
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

function messageContentToText(content: unknown) {
  if (typeof content === 'string') {
    return content;
  }

  return JSON.stringify(content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
