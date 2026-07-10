import { resolve } from "node:path";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  isAIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { z } from "zod";
import type { ChatModelLike } from "../model.factory";
import {
  MAX_ANALYSIS_TOOL_LOOPS,
  type ToolBoundModelLike,
} from "./analysis-subgraph";
import type { AnalysisTools } from "./analysis-tools";

const { ToolNode } = require(
  resolve(
    __dirname,
    "../../../node_modules/@langchain/langgraph/dist/prebuilt/tool_node.cjs",
  ),
) as {
  ToolNode: new (tools: AnalysisTools) => {
    invoke(input: {
      messages: BaseMessage[];
    }): Promise<{ messages?: BaseMessage[] }>;
  };
};

export const ANALYSIS_EXPERT_NAMES = [
  "functional",
  "performance",
  "security",
  "compliance",
] as const;

export type AnalysisExpertName = (typeof ANALYSIS_EXPERT_NAMES)[number];
export type ExpertOutputField =
  | "functionalAnalysis"
  | "performanceAnalysis"
  | "securityAnalysis"
  | "complianceAnalysis";

interface ToolBindableModelLike extends ChatModelLike {
  bindTools(tools: AnalysisTools): ToolBoundModelLike;
}

interface ExpertSubGraphOptions {
  model: ToolBindableModelLike;
  tools: AnalysisTools;
  systemPrompt: string;
  outputField: ExpertOutputField;
  expertName: AnalysisExpertName;
  graphTrace?: string[];
}

export interface AnalysisSupervisorSubGraphOptions {
  model: ToolBindableModelLike;
  tools: AnalysisTools;
  graphTrace?: string[];
}

export const supervisorSchema = z.object({
  activeExperts: z
    .array(z.enum(ANALYSIS_EXPERT_NAMES))
    .max(ANALYSIS_EXPERT_NAMES.length)
    .default(["functional"]),
  reasoning: z.string().default(""),
});

const EXPERT_NODE = {
  agent: "agent",
  tools: "tools",
  finalize: "finalize",
} as const;

const SUPERVISOR_NODE = {
  supervisor: "supervisor",
  functional: "functionalExpert",
  performance: "performanceExpert",
  security: "securityExpert",
  compliance: "complianceExpert",
  aggregator: "aggregator",
} as const;

const EXPERT_TO_NODE: Record<AnalysisExpertName, string> = {
  functional: SUPERVISOR_NODE.functional,
  performance: SUPERVISOR_NODE.performance,
  security: SUPERVISOR_NODE.security,
  compliance: SUPERVISOR_NODE.compliance,
};

const EXPERT_TO_FIELD: Record<AnalysisExpertName, ExpertOutputField> = {
  functional: "functionalAnalysis",
  performance: "performanceAnalysis",
  security: "securityAnalysis",
  compliance: "complianceAnalysis",
};

const EXPERT_LABELS: Record<AnalysisExpertName, string> = {
  functional: "功能专家",
  performance: "性能专家",
  security: "安全专家",
  compliance: "合规专家",
};

const FUNCTIONAL_EXPERT_PROMPT = [
  "你是需求分析团队中的功能分析专家。",
  "目标：把用户需求拆成清晰、可交付、可验收的功能范围。",
  "如果输入包含需求编号（如 REQ-XXX），优先调用 search_requirement 获取已有需求详情。",
  "如果需求涉及登录、认证、权限、会话或单点登录，必要时调用 check_conflicts 识别与现有认证范围的冲突。",
  "分析时覆盖：功能分解、核心流程、用户故事、验收标准、依赖关系、边界条件与不做范围。",
  "输出必须结构化、可直接进入研发评审；不要生成最终总报告，只输出你的功能专家结论。",
].join("\n");

const PERFORMANCE_EXPERT_PROMPT = [
  "你是需求分析团队中的性能与容量专家。",
  "目标：识别需求对响应时间、吞吐、并发、数据量、缓存、异步处理和可观测性的影响。",
  "如果输入包含需求编号（如 REQ-XXX），可以调用 search_requirement 获取已有需求详情后再评估。",
  "分析时覆盖：关键性能路径、容量假设、潜在瓶颈、降级与限流策略、监控指标、压测建议。",
  "请给出明确的复杂度判断和需要研发提前确认的性能问题。",
  "不要生成最终总报告，只输出你的性能专家结论。",
].join("\n");

const SECURITY_EXPERT_PROMPT = [
  "你是需求分析团队中的安全专家。",
  "目标：识别认证、授权、数据暴露、越权、审计、输入校验和第三方集成风险。",
  "如果输入包含需求编号（如 REQ-XXX），优先调用 search_requirement 获取已有需求详情。",
  "如果需求涉及登录、认证、密码、会话、权限或 SSO，必须考虑调用 check_conflicts 检查与现有认证能力的重叠。",
  "分析时覆盖：威胁点、攻击面、权限边界、敏感数据处理、安全验收标准和需要安全评审的事项。",
  "不要生成最终总报告，只输出你的安全专家结论。",
].join("\n");

const COMPLIANCE_EXPERT_PROMPT = [
  "你是需求分析团队中的合规与政策专家。",
  "目标：识别需求是否触及政策条款、隐私合规、留痕审计、用户告知、售后规则或跨区域约束。",
  "如果输入包含需求编号（如 REQ-XXX），优先调用 search_requirement 获取已有需求详情。",
  "如果需求与登录、认证、用户身份或访问控制相关，可以调用 check_conflicts 辅助判断是否与既有能力冲突。",
  "分析时覆盖：适用政策、合规风险、证据留存、用户提示、人工复核条件和合规验收标准。",
  "不要生成最终总报告，只输出你的合规专家结论。",
].join("\n");

export const ExpertSubgraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  toolLoopCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  functionalAnalysis: textAnnotation(),
  performanceAnalysis: textAnnotation(),
  securityAnalysis: textAnnotation(),
  complianceAnalysis: textAnnotation(),
});

export const AnalysisSupervisorState = Annotation.Root({
  ...MessagesAnnotation.spec,
  activeExperts: Annotation<AnalysisExpertName[]>({
    value: (_current, update) => update,
    default: () => [],
  }),
  supervisorReasoning: textAnnotation(),
  functionalAnalysis: textAnnotation(),
  performanceAnalysis: textAnnotation(),
  securityAnalysis: textAnnotation(),
  complianceAnalysis: textAnnotation(),
  analysisResult: textAnnotation(),
});

type ExpertSubgraphStateValue = typeof ExpertSubgraphState.State;
type ExpertSubgraphStateUpdate = typeof ExpertSubgraphState.Update;
type AnalysisSupervisorStateValue = typeof AnalysisSupervisorState.State;
type AnalysisSupervisorStateUpdate = typeof AnalysisSupervisorState.Update;

export function createExpertSubGraph(options: ExpertSubGraphOptions) {
  const boundModel = bindExpertModel(options.model, options.tools);

  async function agentNode(
    state: ExpertSubgraphStateValue,
  ): Promise<ExpertSubgraphStateUpdate> {
    pushTrace(options.graphTrace, `${options.expertName}.agent`);

    let response: BaseMessage;

    try {
      response = await boundModel.invoke([
        new SystemMessage(options.systemPrompt),
        ...state.messages,
      ]);
    } catch (error) {
      response = new AIMessage(buildExpertFallbackOutput(options.expertName, error));
    }

    return { messages: [response] };
  }

  async function toolsNode(
    state: ExpertSubgraphStateValue,
  ): Promise<ExpertSubgraphStateUpdate> {
    pushTrace(options.graphTrace, `${options.expertName}.tools`);

    const toolNode = new ToolNode(options.tools);
    const result = await toolNode.invoke({ messages: state.messages });

    return {
      messages: result.messages ?? [],
      toolLoopCount: state.toolLoopCount + 1,
    };
  }

  function finalizeNode(
    state: ExpertSubgraphStateValue,
  ): ExpertSubgraphStateUpdate {
    pushTrace(options.graphTrace, `${options.expertName}.finalize`);

    const lastAiMessage = [...state.messages]
      .reverse()
      .find((message): message is AIMessage => isAIMessage(message));
    const content = messageContentToText(lastAiMessage?.content).trim();
    const result =
      content ||
      (state.toolLoopCount >= MAX_ANALYSIS_TOOL_LOOPS
        ? `达到工具调用上限(${MAX_ANALYSIS_TOOL_LOOPS})，${EXPERT_LABELS[options.expertName]}已强制结束，请人工补充。`
        : `${EXPERT_LABELS[options.expertName]}未生成有效结论，请稍后重试。`);

    return {
      [options.outputField]: result,
    } as ExpertSubgraphStateUpdate;
  }

  return new StateGraph(ExpertSubgraphState)
    .addNode(EXPERT_NODE.agent, agentNode)
    .addNode(EXPERT_NODE.tools, toolsNode)
    .addNode(EXPERT_NODE.finalize, finalizeNode)
    .addEdge(START, EXPERT_NODE.agent)
    .addConditionalEdges(EXPERT_NODE.agent, routeAfterExpertAgent, [
      EXPERT_NODE.tools,
      EXPERT_NODE.finalize,
    ])
    .addEdge(EXPERT_NODE.tools, EXPERT_NODE.agent)
    .addEdge(EXPERT_NODE.finalize, END)
    .compile();
}

export function createFunctionalExpert(
  model: ToolBindableModelLike,
  tools: AnalysisTools,
  graphTrace?: string[],
) {
  return createExpertSubGraph({
    model,
    tools: toolsByName(tools, ["search_requirement", "check_conflicts"]),
    systemPrompt: FUNCTIONAL_EXPERT_PROMPT,
    outputField: "functionalAnalysis",
    expertName: "functional",
    graphTrace,
  });
}

export function createPerformanceExpert(
  model: ToolBindableModelLike,
  tools: AnalysisTools,
  graphTrace?: string[],
) {
  return createExpertSubGraph({
    model,
    tools: toolsByName(tools, ["search_requirement"]),
    systemPrompt: PERFORMANCE_EXPERT_PROMPT,
    outputField: "performanceAnalysis",
    expertName: "performance",
    graphTrace,
  });
}

export function createSecurityExpert(
  model: ToolBindableModelLike,
  tools: AnalysisTools,
  graphTrace?: string[],
) {
  return createExpertSubGraph({
    model,
    tools: toolsByName(tools, ["search_requirement", "check_conflicts"]),
    systemPrompt: SECURITY_EXPERT_PROMPT,
    outputField: "securityAnalysis",
    expertName: "security",
    graphTrace,
  });
}

export function createComplianceExpert(
  model: ToolBindableModelLike,
  tools: AnalysisTools,
  graphTrace?: string[],
) {
  return createExpertSubGraph({
    model,
    tools: toolsByName(tools, ["search_requirement", "check_conflicts"]),
    systemPrompt: COMPLIANCE_EXPERT_PROMPT,
    outputField: "complianceAnalysis",
    expertName: "compliance",
    graphTrace,
  });
}

export function createAnalysisSupervisorSubGraph(
  options: AnalysisSupervisorSubGraphOptions,
) {
  const functionalExpert = createFunctionalExpert(
    options.model,
    options.tools,
    options.graphTrace,
  );
  const performanceExpert = createPerformanceExpert(
    options.model,
    options.tools,
    options.graphTrace,
  );
  const securityExpert = createSecurityExpert(
    options.model,
    options.tools,
    options.graphTrace,
  );
  const complianceExpert = createComplianceExpert(
    options.model,
    options.tools,
    options.graphTrace,
  );

  return new StateGraph(AnalysisSupervisorState)
    .addNode(SUPERVISOR_NODE.supervisor, (state) =>
      supervisorNode(state, options.model, options.graphTrace),
    )
    .addNode(SUPERVISOR_NODE.functional, (state) =>
      invokeExpertNode(
        state,
        functionalExpert,
        "functional",
        options.graphTrace,
      ),
    )
    .addNode(SUPERVISOR_NODE.performance, (state) =>
      invokeExpertNode(
        state,
        performanceExpert,
        "performance",
        options.graphTrace,
      ),
    )
    .addNode(SUPERVISOR_NODE.security, (state) =>
      invokeExpertNode(state, securityExpert, "security", options.graphTrace),
    )
    .addNode(SUPERVISOR_NODE.compliance, (state) =>
      invokeExpertNode(
        state,
        complianceExpert,
        "compliance",
        options.graphTrace,
      ),
    )
    .addNode(SUPERVISOR_NODE.aggregator, (state) =>
      aggregatorNode(state, options.graphTrace),
    )
    .addEdge(START, SUPERVISOR_NODE.supervisor)
    .addConditionalEdges(SUPERVISOR_NODE.supervisor, routeToExperts, [
      SUPERVISOR_NODE.functional,
      SUPERVISOR_NODE.performance,
      SUPERVISOR_NODE.security,
      SUPERVISOR_NODE.compliance,
      SUPERVISOR_NODE.aggregator,
    ])
    .addEdge(SUPERVISOR_NODE.functional, SUPERVISOR_NODE.aggregator)
    .addEdge(SUPERVISOR_NODE.performance, SUPERVISOR_NODE.aggregator)
    .addEdge(SUPERVISOR_NODE.security, SUPERVISOR_NODE.aggregator)
    .addEdge(SUPERVISOR_NODE.compliance, SUPERVISOR_NODE.aggregator)
    .addEdge(SUPERVISOR_NODE.aggregator, END)
    .compile();
}

export async function supervisorNode(
  state: AnalysisSupervisorStateValue,
  model: Pick<ChatModelLike, "withStructuredOutput">,
  graphTrace?: string[],
): Promise<AnalysisSupervisorStateUpdate> {
  pushTrace(graphTrace, SUPERVISOR_NODE.supervisor);

  if (typeof model.withStructuredOutput === "function") {
    try {
      const structuredModel = model.withStructuredOutput(supervisorSchema);
      const parsed = supervisorSchema.parse(
        await structuredModel.invoke([
          new SystemMessage(
            [
              "你是需求分析 Supervisor，需要判断本轮分析应该交给哪些专家并行处理。",
              "可选专家：",
              "- functional：功能拆解、用户故事、验收标准、依赖与边界。",
              "- performance：响应时间、吞吐、并发、容量、缓存、异步和监控。",
              "- security：认证、授权、数据暴露、越权、审计和输入安全。",
              "- compliance：政策条款、隐私合规、用户告知、留痕和人工复核。",
              "至少选择 functional；只有在需求确实涉及对应风险时再选择其他专家。",
              "输出 activeExperts 和 reasoning。",
            ].join("\n"),
          ),
          new HumanMessage(messagesToText(state.messages)),
        ]),
      );

      return {
        activeExperts: normalizeExperts(parsed.activeExperts),
        supervisorReasoning: parsed.reasoning,
      };
    } catch {
      // Fall through to deterministic routing when structured output is unavailable.
    }
  }

  return {
    activeExperts: selectExpertsByRules(messagesToText(state.messages)),
    supervisorReasoning: "fallback: selected experts by keyword rules",
  };
}

export function routeToExperts(state: AnalysisSupervisorStateValue) {
  const expertNodes = normalizeExperts(state.activeExperts).map(
    (expertName) => EXPERT_TO_NODE[expertName],
  );

  return expertNodes.length > 0 ? expertNodes : [SUPERVISOR_NODE.aggregator];
}

export function aggregatorNode(
  state: AnalysisSupervisorStateValue,
  graphTrace?: string[],
): AnalysisSupervisorStateUpdate {
  pushTrace(graphTrace, SUPERVISOR_NODE.aggregator);

  const activeExperts = normalizeExperts(state.activeExperts);
  const sections = activeExperts.flatMap((expertName) => {
    const output = state[EXPERT_TO_FIELD[expertName]];

    if (!output?.trim()) {
      return [];
    }

    const trimmed = output.trim();

    if (isExpertFallbackOutput(trimmed)) {
      return [`## ${EXPERT_LABELS[expertName]}\n> 生产降级：${trimmed}`];
    }

    return [`## ${EXPERT_LABELS[expertName]}\n${trimmed}`];
  });

  return {
    analysisResult:
      sections.join("\n\n") ||
      "Supervisor 未选择可执行专家或专家未生成有效结论，请转人工补充需求分析。",
  };
}

async function invokeExpertNode(
  state: AnalysisSupervisorStateValue,
  expertGraph: ReturnType<typeof createExpertSubGraph>,
  expertName: AnalysisExpertName,
  graphTrace?: string[],
): Promise<AnalysisSupervisorStateUpdate> {
  const outputField = EXPERT_TO_FIELD[expertName];
  const expertState = await expertGraph.invoke({
    messages: state.messages,
    toolLoopCount: 0,
    [outputField]: state[outputField] ?? null,
  } as typeof ExpertSubgraphState.Update);

  pushTrace(graphTrace, expertName);

  return {
    [outputField]: expertState[outputField] ?? null,
  } as AnalysisSupervisorStateUpdate;
}

function routeAfterExpertAgent(state: ExpertSubgraphStateValue) {
  const lastMessage = state.messages[state.messages.length - 1];
  const hasToolCalls =
    isAIMessage(lastMessage) &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0;

  if (hasToolCalls && state.toolLoopCount < MAX_ANALYSIS_TOOL_LOOPS) {
    return EXPERT_NODE.tools;
  }

  return EXPERT_NODE.finalize;
}

function bindExpertModel(model: ToolBindableModelLike, tools: AnalysisTools) {
  if (!model || typeof model.bindTools !== "function") {
    throw new Error(
      "Chat model with bindTools support is required for expert subgraphs",
    );
  }

  return model.bindTools(tools);
}

function toolsByName(tools: AnalysisTools, names: string[]): AnalysisTools {
  const selected = tools.filter((candidate) =>
    names.includes(String(candidate.name)),
  );

  return selected as AnalysisTools;
}

function normalizeExperts(experts: AnalysisExpertName[]): AnalysisExpertName[] {
  const normalized = ANALYSIS_EXPERT_NAMES.filter((expertName) =>
    experts.includes(expertName),
  );

  return normalized.length > 0 ? normalized : ["functional"];
}

function selectExpertsByRules(input: string): AnalysisExpertName[] {
  const experts = new Set<AnalysisExpertName>(["functional"]);

  if (
    /(性能|响应|延迟|吞吐|并发|容量|压测|缓存|降级|限流|performance|latency|throughput|concurrency)/i.test(
      input,
    )
  ) {
    experts.add("performance");
  }

  if (
    /(安全|登录|认证|鉴权|权限|密码|会话|单点登录|sso|审计|越权|security|auth|permission)/i.test(
      input,
    )
  ) {
    experts.add("security");
  }

  if (
    /(合规|政策|隐私|条款|留痕|审计|退款|退货|客服|售后|compliance|privacy|policy|gdpr)/i.test(
      input,
    )
  ) {
    experts.add("compliance");
  }

  return [...experts];
}

function messagesToText(messages: BaseMessage[]) {
  return messages
    .map((message) => messageContentToText(message.content))
    .join("\n");
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

function buildExpertFallbackOutput(
  expertName: AnalysisExpertName,
  error: unknown,
) {
  return `[${expertName} 专家暂不可用：${errorToText(error)}] 本项分析已跳过，建议人工补充。`;
}

function isExpertFallbackOutput(output: string) {
  return /^\[(functional|performance|security|compliance) 专家暂不可用：/.test(
    output,
  );
}

function errorToText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function textAnnotation() {
  return Annotation<string | null>({
    value: (_current, update) => update,
    default: () => null,
  });
}

function pushTrace(graphTrace: string[] | undefined, nodeName: string) {
  graphTrace?.push(nodeName);
}
