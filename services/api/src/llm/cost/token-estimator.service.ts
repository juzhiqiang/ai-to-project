import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { createChatModel } from '../model.factory';
import { loadLangChainConfig } from '../../config/load-langchain-config';
import { getModelPricing, type ModelPricing } from './token-estimator';

export type LiveTokenEstimateInput = {
  nodeName?: string | null;
  systemPrompt?: string | null;
  toolSchemas?: unknown;
  messages?: unknown;
  outputText?: string | null;
};

export type LiveTokenEstimateResult = {
  nodeName: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  pricing: ModelPricing;
  outputText: string;
  mode: 'live';
};

// 读取后端 langchain.yaml 配置的模型名，前端无需、也不能选择模型。
export function getConfiguredModelName(): string {
  return loadLangChainConfig().llm.model;
}

// 把 design-time 估算器同样的拼接规则（system + toolSchemas + messages）
// 还原成真实发送给模型的 BaseMessage 列表，保证“真实调用”与“估算”同源。
function buildMessages(input: LiveTokenEstimateInput): BaseMessage[] {
  const messages: BaseMessage[] = [];

  if (input.systemPrompt?.trim()) {
    messages.push(new SystemMessage(input.systemPrompt));
  }

  const toolText = serializePart(input.toolSchemas);
  const humanText = [toolText, serializePart(input.messages)].filter(Boolean).join('\n');

  if (humanText) {
    messages.push(new HumanMessage(humanText));
  }

  return messages;
}

// 真实调用后端配置的模型，并按 provider 实际返回的 usage_metadata 计算成本。
// 这样既满足“真实调用 AI 的返回计算”，又避免前端选择模型——用后端配置什么就算什么。
export async function runLiveTokenEstimate(input: LiveTokenEstimateInput): Promise<LiveTokenEstimateResult> {
  const modelName = getConfiguredModelName();
  const model = createChatModel();
  const response = await withTimeout(model.invoke(buildMessages(input)), LIVE_CALL_TIMEOUT_MS);

  // ChatModelLike.invoke 类型收窄为 { content }，但底层 ChatOpenAI 返回的是
  // 带 usage_metadata 的 AIMessage，这里读取真实 token 用量。
  const usage = (
    response as unknown as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
  ).usage_metadata;

  const pricing = getModelPricing(modelName);
  const inputTokens = Number(usage?.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage?.output_tokens ?? 0) || 0;
  const estimatedCostUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const outputText = typeof response.content === 'string' ? response.content : '';

  return {
    nodeName: input.nodeName ?? 'token-estimator-playground',
    modelName,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    pricing,
    outputText,
    mode: 'live',
  };
}

function serializePart(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serializePart).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    if ('content' in value) {
      return serializePart((value as { content?: unknown }).content);
    }

    return JSON.stringify(value);
  }

  return String(value);
}


const LIVE_CALL_TIMEOUT_MS = 3 * 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Live token estimate timed out after ${ms}ms (provider did not respond)`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

