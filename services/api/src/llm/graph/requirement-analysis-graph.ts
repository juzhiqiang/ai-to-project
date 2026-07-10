import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  type Runtime,
} from "@langchain/langgraph";
import { z } from "zod";
import type {
  CustomerServiceAgentName,
  CustomerServiceAgents,
} from "../agents/sub-agents";
import type { ChatModelLike } from "../model.factory";
import type { ToolBoundModelLike } from "./analysis-subgraph";
import { createAnalysisTools, type AnalysisTools } from "./analysis-tools";
import {
  AnalysisSupervisorState,
  createAnalysisSupervisorSubGraph,
  type AnalysisExpertName,
} from "./experts";
import {
  createSummarySubGraph,
  type SummaryModelLike,
} from "./summary-subgraph";

const REQUIRED_EXTRACTION_FIELDS = [
  "orderId",
  "requestType",
  "receivedDate",
  "isUnopened",
] as const;
const INTENTS = ["analyze", "query", "chat"] as const;
const GRAPH_NODE = {
  classifier: "classifier",
  extract: "extract",
  clarify: "clarify",
  analysis: "analysis_step",
  risk: "risk_step",
  summary: "summary_step",
  queryHandler: "queryHandler",
  chatHandler: "chatHandler",
} as const;

const intentSchema = z.object({
  intent: z.enum(INTENTS),
  reasoning: z.string(),
});

const summarySubGraph = createSummarySubGraph();

export type RequirementIntent = (typeof INTENTS)[number];
export type RequirementAnalysisStepName =
  | CustomerServiceAgentName
  | "classifier"
  | "queryHandler"
  | "chatHandler";

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
  mode: "completed" | "clarification" | "fallback";
  clarificationQuestions: string[];
  usedAgents: RequirementAnalysisStepName[];
  fallback: "manual_review" | null;
  steps: AgentStep[];
  graphTrace: string[];
  report: string;
  errorMessage?: string | null;
  intent?: RequirementIntent;
  reasoning?: string | null;
  queryResponse?: string | null;
  chatResponse?: string | null;
  critique?: string | null;
  critiqueIssues?: string[];
  reviseCount?: number;
  summaryDraft?: string | null;
  activeExperts?: AnalysisExpertName[];
  supervisorReasoning?: string | null;
  functionalAnalysis?: string | null;
  performanceAnalysis?: string | null;
  securityAnalysis?: string | null;
  complianceAnalysis?: string | null;
}

export interface OrchestratorInput {
  input: string;
  policyContext?: string;
}

export interface RequirementAnalysisGraphInput extends OrchestratorInput {
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
  summaryModel?: SummaryModelLike;
  graphTrace?: string[];
  graphTimeoutMs?: number | null;
}

export interface RequirementClarification {
  questions: string[];
}

interface RequirementAnalysisRuntime {
  input: string;
  policyContext: string;
  agents: CustomerServiceAgents;
  model?: ChatModelLike;
  summaryModel?: SummaryModelLike;
  analysisModel?: ToolBoundModelLike;
  analysisTools?: AnalysisTools;
  graphTrace: string[];
  steps: AgentStep[];
}

interface ToolBindableModelLike extends ChatModelLike {
  bindTools(tools: AnalysisTools): ToolBoundModelLike;
}

export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<RequirementIntent>({
    value: (_current, update) => update,
    default: () => "analyze",
  }),
  reasoning: Annotation<string | null>(),
  extracted: Annotation<CustomerServiceExtraction | null>(),
  clarified: Annotation<RequirementClarification | null>(),
  analysis: Annotation<string | null>(),
  analysisResult: Annotation<string | null>({
    value: (_current, update) => update,
    default: () => null,
  }),
  activeExperts: Annotation<AnalysisExpertName[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  supervisorReasoning: Annotation<string | null>(),
  functionalAnalysis: Annotation<string | null>(),
  performanceAnalysis: Annotation<string | null>(),
  securityAnalysis: Annotation<string | null>(),
  complianceAnalysis: Annotation<string | null>(),
  toolLoopCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  risk: Annotation<string | null>(),
  summary: Annotation<string | null>(),
  summaryDraft: Annotation<string | null>(),
  critique: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  critiqueIssues: Annotation<string[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  reviseCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  queryResponse: Annotation<string | null>(),
  chatResponse: Annotation<string | null>(),
});

const RequirementAnalysisContext = Annotation.Root({
  requirementAnalysis: Annotation<RequirementAnalysisRuntime>(),
});

export type RequirementAnalysisStateValue =
  typeof RequirementAnalysisState.State;
type RequirementAnalysisStateUpdate = typeof RequirementAnalysisState.Update;
type RequirementAnalysisNodeRuntime = Runtime<
  typeof RequirementAnalysisContext.State
>;

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

export async function runAnalysisGraph(
  input: RequirementAnalysisGraphInput,
): Promise<OrchestratorResult> {
  const runtime = normalizeGraphInput(input);

  try {
    const graph = createAnalysisGraph();
    const statePromise = graph.invoke(
      { messages: [], toolLoopCount: 0, analysisResult: null },
      { context: { requirementAnalysis: runtime } },
    );
    const state = shouldApplyGraphTimeout(input.graphTimeoutMs)
      ? await withTimeout(statePromise, input.graphTimeoutMs)
      : await statePromise;

    return buildResult(state, runtime.steps, runtime.graphTrace);
  } catch (error) {
    return {
      mode: "fallback",
      clarificationQuestions: [],
      usedAgents: runtime.steps.map((step) => step.agent),
      fallback: "manual_review",
      steps: runtime.steps,
      graphTrace: runtime.graphTrace,
      errorMessage: errorToMessage(error),
      report: "",
    };
  }
}

async function extractNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const extractionOutput = await runtime.agents.extractAgent.invoke({
    input: runtime.input,
  });
  const extraction = completeExtraction(
    parseExtraction(extractionOutput),
    runtime.input,
  );

  runtime.steps.push({
    agent: "extractAgent",
    output: JSON.stringify(extraction),
  });

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
      const result = intentSchema.parse(
        await structuredModel.invoke(buildClassifierMessages(runtime.input)),
      );

      return {
        intent: result.intent,
        reasoning: result.reasoning,
      };
    }
  } catch {
    // Classification should not block the graph.
  }

  return classifyIntentByRules(runtime.input);
}

function clarifyNode(
  state: RequirementAnalysisStateValue,
): RequirementAnalysisStateUpdate {
  const clarificationQuestions = buildClarificationQuestions(
    state.extracted ?? {},
  );

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
    return { analysis: null, analysisResult: null, toolLoopCount: 0 };
  }

  runtime.analysisTools = runtime.analysisTools ?? createAnalysisTools();
  if (!runtime.model) {
    throw new Error(
      "Chat model is required for the analysis supervisor subgraph",
    );
  }

  const analysisSupervisorSubGraph = createAnalysisSupervisorSubGraph({
    model: runtime.model as ChatModelLike & {
      bindTools(tools: AnalysisTools): ToolBoundModelLike;
    },
    tools: runtime.analysisTools,
    graphTrace: runtime.graphTrace,
  });

  const subgraphState = await analysisSupervisorSubGraph.invoke({
    messages:
      state.messages.length > 0
        ? state.messages
        : [new HumanMessage(runtime.input)],
    activeExperts: state.activeExperts,
    supervisorReasoning: state.supervisorReasoning,
    functionalAnalysis: state.functionalAnalysis,
    performanceAnalysis: state.performanceAnalysis,
    securityAnalysis: state.securityAnalysis,
    complianceAnalysis: state.complianceAnalysis,
    analysisResult: state.analysisResult,
  } as typeof AnalysisSupervisorState.Update);

  return {
    activeExperts: subgraphState.activeExperts,
    supervisorReasoning: subgraphState.supervisorReasoning,
    functionalAnalysis: subgraphState.functionalAnalysis,
    performanceAnalysis: subgraphState.performanceAnalysis,
    securityAnalysis: subgraphState.securityAnalysis,
    complianceAnalysis: subgraphState.complianceAnalysis,
    analysisResult: subgraphState.analysisResult,
    analysis: subgraphState.analysisResult,
  };
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
  const analysisText = ensureText(
    state.analysisResult ?? state.analysis,
    "analysis subgraph output is required before risk review",
  );
  const riskReview = await runtime.agents.riskReviewAgent.invoke({
    input: runtime.input,
    extraction: JSON.stringify(extraction),
    policyContext: runtime.policyContext,
  });

  runtime.steps.push({ agent: "riskReviewAgent", output: riskReview });

  return {
    analysis: analysisText,
    risk: riskReview,
  };
}

async function summaryNode(
  state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);

  if (hasClarificationQuestions(state)) {
    return { summary: "" };
  }

  const extraction = ensureExtraction(state.extracted);
  const extractionText = JSON.stringify(extraction);
  const analysisText = ensureText(
    state.analysisResult ?? state.analysis,
    "analysis subgraph output is required before summary",
  );
  const riskReview = ensureText(
    state.risk,
    "riskReviewAgent output is required before summary",
  );
  const qa = await runtime.agents.qaAgent.invoke({
    extraction: extractionText,
    policyContext: runtime.policyContext,
    policyCheck: analysisText,
    riskReview,
  });
  runtime.steps.push({ agent: "qaAgent", output: qa });

  const summaryInput = {
    input: runtime.input,
    extraction: extractionText,
    policyContext: runtime.policyContext,
    policyCheck: analysisText,
    riskReview,
    qa,
  };

  if (!runtime.summaryModel) {
    const report = await runtime.agents.summaryAgent.invoke(summaryInput);
    runtime.steps.push({ agent: "summaryAgent", output: report });

    return {
      summary: report,
      summaryDraft: report,
      critique: "",
      critiqueIssues: [],
      reviseCount: 0,
    };
  }

  const summaryState = await summarySubGraph.invoke(
    {
      summary: state.summary ?? "",
      summaryDraft: state.summaryDraft ?? "",
      critique: state.critique ?? "",
      critiqueIssues: state.critiqueIssues ?? [],
      reviseCount: state.reviseCount ?? 0,
    },
    {
      context: {
        requirementAnalysis: {
          input: runtime.input,
          policyContext: runtime.policyContext,
          extractionText,
          analysisText,
          riskReview,
          qa,
          summaryModel: runtime.summaryModel,
          graphTrace: runtime.graphTrace,
        },
      },
    },
  );
  const report = summaryState.summary ?? "";
  runtime.steps.push({ agent: "summaryAgent", output: report });

  return {
    summary: report,
    summaryDraft: summaryState.summaryDraft,
    critique: summaryState.critique,
    critiqueIssues: summaryState.critiqueIssues,
    reviseCount: summaryState.reviseCount,
  };
}

async function queryHandlerNode(
  _state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  const response = await invokeResponseModel(runtime.model, [
    new SystemMessage(
      "你是需求查询助手。请根据用户输入简洁回答需求状态、进度、报告或历史分析查询。",
    ),
    new HumanMessage(runtime.input),
  ]);

  runtime.steps.push({ agent: "queryHandler", output: response });

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
    new SystemMessage("你是友好的 AI 助手。请自然、简洁地回应用户闲聊。"),
    new HumanMessage(runtime.input),
  ]);

  runtime.steps.push({ agent: "chatHandler", output: response });

  return {
    chatResponse: response,
    summary: response,
  };
}

function normalizeGraphInput(
  input: RequirementAnalysisGraphInput,
): RequirementAnalysisRuntime {
  const analysisTools = createAnalysisTools();

  return {
    input: input.input,
    policyContext: input.policyContext?.trim() || "无相关政策文档",
    agents: input.agents,
    model: input.model,
    summaryModel: input.summaryModel ?? buildSummaryModel(input.model),
    analysisTools,
    analysisModel: buildAnalysisModel(input.model, analysisTools),
    graphTrace: input.graphTrace ?? [],
    steps: [],
  };
}

function buildResult(
  state: RequirementAnalysisStateValue,
  steps: AgentStep[],
  graphTrace: string[],
): OrchestratorResult {
  const clarificationQuestions = state.clarified?.questions ?? [];
  const base = {
    intent: state.intent,
    reasoning: state.reasoning ?? null,
    queryResponse: state.queryResponse ?? null,
    chatResponse: state.chatResponse ?? null,
    critique: state.critique ?? null,
    critiqueIssues: state.critiqueIssues ?? [],
    reviseCount: state.reviseCount ?? 0,
    summaryDraft: state.summaryDraft ?? null,
    activeExperts: state.activeExperts ?? [],
    supervisorReasoning: state.supervisorReasoning ?? null,
    functionalAnalysis: state.functionalAnalysis ?? null,
    performanceAnalysis: state.performanceAnalysis ?? null,
    securityAnalysis: state.securityAnalysis ?? null,
    complianceAnalysis: state.complianceAnalysis ?? null,
    graphTrace,
  };

  if (clarificationQuestions.length > 0) {
    return {
      ...base,
      mode: "clarification",
      clarificationQuestions,
      usedAgents: steps.map((step) => step.agent),
      fallback: null,
      steps,
      report: "",
    };
  }

  return {
    ...base,
    mode: "completed",
    clarificationQuestions: [],
    usedAgents: steps.map((step) => step.agent),
    fallback: null,
    steps,
    report: state.summary ?? state.analysisResult ?? "",
  };
}

function routeByIntent(state: RequirementAnalysisStateValue) {
  if (state.intent === "query") {
    return GRAPH_NODE.queryHandler;
  }

  if (state.intent === "chat") {
    return GRAPH_NODE.chatHandler;
  }

  return GRAPH_NODE.extract;
}

function buildClassifierMessages(input: string): BaseMessage[] {
  return [
    new SystemMessage(
      [
        "你是需求请求意图分类器。请只判断当前请求属于 analyze、query、chat 之一。",
        "analyze：用户提出新需求、描述功能、请求评估、分析可行性或风险。",
        "query：用户查询已有需求、需求编号、状态、进度、报告或历史分析结果。",
        "chat：用户只是问候、寒暄或闲聊，没有提出分析或查询诉求。",
        "边界情况：例如“查询 REQ-20240315-001 的风险分析报告”应判定为 query。",
        "优先级：需求编号 + 查询词 优先判定为 query；纯闲聊优先判定为 chat；其余默认 analyze。",
        "输出必须包含 intent 和 reasoning。",
      ].join("\n"),
    ),
    new HumanMessage(input),
  ];
}

function classifyIntentByRules(input: string): {
  intent: RequirementIntent;
  reasoning: string;
} {
  if (isQueryIntent(input)) {
    return {
      intent: "query",
      reasoning:
        "fallback: matched request id with query/status/report keywords",
    };
  }

  if (isChatIntent(input)) {
    return {
      intent: "chat",
      reasoning: "fallback: matched greeting or small-talk keywords",
    };
  }

  return { intent: "analyze", reasoning: "fallback: defaulted to analyze" };
}

function isQueryIntent(input: string) {
  return (
    hasRequirementId(input) &&
    /(查询|查看|看看|状态|进度|报告|结果|当前|如何|有没有|query|status|progress|report)/i.test(
      input,
    )
  );
}

function isChatIntent(input: string) {
  return /^(你好|您好|hi|hello|hey)([，,\s!。？?].*)?$/i.test(input.trim());
}

function hasRequirementId(input: string) {
  return /\bREQ-[A-Z0-9-]+\b/i.test(input);
}

async function invokeResponseModel(
  model: ChatModelLike | undefined,
  messages: BaseMessage[],
) {
  if (!model) {
    throw new Error("Chat model is required for routed response");
  }

  const response = await model.invoke(messages);

  return messageContentToText(response.content);
}

function getRuntime(
  runtimeConfig: RequirementAnalysisNodeRuntime,
): RequirementAnalysisRuntime {
  const runtime =
    runtimeConfig.context?.requirementAnalysis ??
    runtimeConfig.configurable?.requirementAnalysis;

  if (!runtime) {
    throw new Error("Requirement analysis graph runtime is required");
  }

  return runtime;
}

function buildAnalysisModel(
  model: ChatModelLike | undefined,
  analysisTools: AnalysisTools,
) {
  if (
    !model ||
    typeof (model as Partial<ToolBindableModelLike>).bindTools !== "function"
  ) {
    return undefined;
  }

  return (model as ToolBindableModelLike).bindTools(analysisTools);
}

function buildSummaryModel(model: ChatModelLike | undefined) {
  if (!model || typeof model.withStructuredOutput !== "function") {
    return undefined;
  }

  return model as SummaryModelLike;
}

function parseExtraction(output: string): CustomerServiceExtraction {
  const jsonText = stripJsonFence(output);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("extractAgent output must be a JSON object");
  }

  return parsed as CustomerServiceExtraction;
}

function completeExtraction(
  extraction: CustomerServiceExtraction,
  input: string,
): CustomerServiceExtraction {
  return {
    ...extraction,
    requestType: hasExtractionValue(extraction.requestType)
      ? extraction.requestType
      : inferRequestType(input),
    receivedDate: hasExtractionValue(extraction.receivedDate)
      ? extraction.receivedDate
      : inferReceivedDate(input),
    isUnopened: hasExtractionValue(extraction.isUnopened)
      ? extraction.isUnopened
      : inferIsUnopened(input),
  };
}

function inferRequestType(input: string) {
  if (/(退货|退回|return)/i.test(input)) {
    return "return";
  }

  if (/(退款|refund)/i.test(input)) {
    return "refund";
  }

  if (/(换货|更换|exchange)/i.test(input)) {
    return "exchange";
  }

  return null;
}

function inferReceivedDate(input: string) {
  const relativeBeforeVerb = input.match(
    /(今天|昨天|前天|刚刚|当天).{0,12}(收到|签收|收货)/,
  );
  const verbBeforeRelative = input.match(
    /(收到|签收|收货).{0,12}(今天|昨天|前天|刚刚|当天)/,
  );
  const absoluteDate = input.match(
    /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}日)/,
  );

  return (
    relativeBeforeVerb?.[1] ??
    verbBeforeRelative?.[2] ??
    absoluteDate?.[1] ??
    null
  );
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
  return value !== undefined && value !== null && value !== "";
}

function questionForField(field: (typeof REQUIRED_EXTRACTION_FIELDS)[number]) {
  const questions = {
    orderId: "请提供订单号。",
    requestType: "请说明诉求类型，例如退货、退款或换货。",
    receivedDate: "请说明收货日期或签收时间。",
    isUnopened: "请确认商品是否未拆封。",
  };

  return questions[field];
}

function hasClarificationQuestions(state: RequirementAnalysisStateValue) {
  return (state.clarified?.questions.length ?? 0) > 0;
}

function ensureExtraction(
  extraction: CustomerServiceExtraction | null | undefined,
): CustomerServiceExtraction {
  if (!extraction) {
    throw new Error("extractAgent output is required");
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
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        return "";
      })
      .join("");
  }

  if (
    content &&
    typeof content === "object" &&
    "text" in content &&
    typeof (content as { text?: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }

  return String(content ?? "");
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? "Unknown requirement analysis error");
}

function shouldApplyGraphTimeout(
  timeoutMs: number | null | undefined,
): timeoutMs is number {
  return typeof timeoutMs === "number" && timeoutMs > 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(`Requirement analysis graph timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
