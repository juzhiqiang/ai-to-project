import { resolve } from 'node:path';
import { AIMessage, SystemMessage, isAIMessage, type BaseMessage } from '@langchain/core/messages';
import { Annotation, END, MessagesAnnotation, START, StateGraph, type Runtime } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import type { AnalysisTools } from './analysis-tools';

const { ToolNode } = require(
  resolve(__dirname, '../../../node_modules/@langchain/langgraph/dist/prebuilt/tool_node.cjs'),
) as {
  ToolNode: new (tools: AnalysisTools) => {
    invoke(input: { messages: BaseMessage[] }): Promise<{ messages?: BaseMessage[] }>;
  };
};

export const MAX_ANALYSIS_TOOL_LOOPS = 6;

const ANALYSIS_SYSTEM_PROMPT = [
  '你是需求分析子图中的 ReAct 分析代理。',
  '如果用户输入中包含需求编号（如 REQ-XXX），优先调用 search_requirement 获取详情。',
  '如果需求涉及登录、认证、密码、单点登录或类似能力，必要时调用 check_conflicts。',
  '一旦获得足够信息，直接输出最终分析结论，不要继续调用工具。',
  '避免对相同参数重复调用同一个工具。',
  '最终输出至少包含以下四部分：功能分解、用户故事、验收标准、技术复杂度评估。',
].join('\n');

export interface ToolBoundModelLike {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}

export interface AnalysisSubgraphRuntime {
  analysisModel: ToolBoundModelLike;
  analysisTools: AnalysisTools;
  graphTrace?: string[];
}

export const AnalysisSubgraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  toolLoopCount: Annotation<number>({
    value: (_current, update) => update,
    default: () => 0,
  }),
  analysisResult: Annotation<string | null>({
    value: (_current, update) => update,
    default: () => null,
  }),
});

const AnalysisSubgraphContext = Annotation.Root({
  requirementAnalysis: Annotation<AnalysisSubgraphRuntime>(),
});

type AnalysisSubgraphStateValue = typeof AnalysisSubgraphState.State;
type AnalysisSubgraphStateUpdate = typeof AnalysisSubgraphState.Update;
type AnalysisSubgraphNodeRuntime = Runtime<typeof AnalysisSubgraphContext.State>;

export function createAnalysisSubGraph() {
  return new StateGraph(AnalysisSubgraphState, AnalysisSubgraphContext)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, ['tools', 'finalize'])
    .addEdge('tools', 'agent')
    .addEdge('finalize', END)
    .compile();
}

async function agentNode(
  state: AnalysisSubgraphStateValue,
  runtimeConfig: AnalysisSubgraphNodeRuntime,
): Promise<AnalysisSubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'agent');

  const response = await runtime.analysisModel.invoke([
    new SystemMessage(ANALYSIS_SYSTEM_PROMPT),
    ...state.messages,
  ]);

  return { messages: [response] };
}

async function toolsNode(
  state: AnalysisSubgraphStateValue,
  runtimeConfig: AnalysisSubgraphNodeRuntime,
): Promise<AnalysisSubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'tools');

  const toolNode = new ToolNode(runtime.analysisTools);
  const result = (await toolNode.invoke({ messages: state.messages })) as { messages?: BaseMessage[] };

  return {
    messages: result.messages ?? [],
    toolLoopCount: state.toolLoopCount + 1,
  };
}

async function finalizeNode(
  state: AnalysisSubgraphStateValue,
  runtimeConfig: AnalysisSubgraphNodeRuntime,
): Promise<AnalysisSubgraphStateUpdate> {
  const runtime = getRuntime(runtimeConfig);
  pushTrace(runtime, 'finalize');

  const lastAiMessage = [...state.messages].reverse().find((message): message is AIMessage => isAIMessage(message));
  const content = messageContentToText(lastAiMessage?.content).trim();
  const analysisResult =
    content ||
    (state.toolLoopCount >= MAX_ANALYSIS_TOOL_LOOPS
      ? `达到工具调用上限(${MAX_ANALYSIS_TOOL_LOOPS})，已强制结束，请基于已获取信息人工补充分析。`
      : '未生成有效分析结果，请稍后重试。');

  if ((runtime.graphTrace?.length ?? 0) > 0) {
    Logger.log(runtime.graphTrace?.join(' -> '), 'AnalysisSubgraph');
  }

  return { analysisResult };
}

function routeAfterAgent(state: AnalysisSubgraphStateValue) {
  const lastMessage = state.messages[state.messages.length - 1];
  const hasToolCalls = isAIMessage(lastMessage) && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0;

  if (hasToolCalls && state.toolLoopCount < MAX_ANALYSIS_TOOL_LOOPS) {
    return 'tools';
  }

  return 'finalize';
}

function getRuntime(runtimeConfig: AnalysisSubgraphNodeRuntime): AnalysisSubgraphRuntime {
  const runtime = runtimeConfig.context?.requirementAnalysis ?? runtimeConfig.configurable?.requirementAnalysis;

  if (!runtime?.analysisModel) {
    throw new Error('Analysis subgraph runtime with a bound tool model is required');
  }

  if (!runtime.analysisTools) {
    throw new Error('Analysis subgraph runtime tools are required');
  }

  return runtime;
}

function pushTrace(runtime: AnalysisSubgraphRuntime, nodeName: string) {
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
