export type ModelPricing = {
  input: number;
  output: number;
  cachedInput?: number;
};

export type GraphNodeCostInput = {
  nodeName: string;
  modelName: string;
  systemPrompt?: string | null;
  toolSchemas?: unknown;
  messages?: unknown;
  outputText?: string | null;
};

export type GraphNodeCostEstimate = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

// 以上价格示例自 2025-2026 年早期，仅供参考；上线前请以厂商官网为准。
export const PRICING: Record<string, ModelPricing> = {
  'gpt-4o': {
    input: 2.5,
    output: 10,
    cachedInput: 1.25,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
    cachedInput: 0.075,
  },
  'claude-sonnet': {
    input: 3,
    output: 15,
    cachedInput: 0.3,
  },
  'claude-haiku': {
    input: 0.8,
    output: 4,
    cachedInput: 0.08,
  },
  'deepseek-chat': {
    input: 0.27,
    output: 1.1,
  },
  // 后端 config/langchain.yaml 实际配置的模型（示例价，上线前以厂商官网为准）。
  'gpt-5.5': { input: 10, output: 30 },
  'grok-4.3-high': {
    input: 5,
    output: 15,
    cachedInput: 2.5,
  },
};

const DEFAULT_MODEL = 'gpt-4o-mini';
const CHINESE_OR_FULLWIDTH_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/gu;

export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const chineseLikeCharacters = text.match(CHINESE_OR_FULLWIDTH_RE)?.length ?? 0;
  const nonChineseCharacters = text.length - chineseLikeCharacters;

  return Math.ceil(chineseLikeCharacters + nonChineseCharacters * 0.25);
}

export function getModelPricing(modelName: string): ModelPricing {
  const normalizedName = modelName?.trim().toLowerCase();

  return PRICING[normalizedName] ?? PRICING[DEFAULT_MODEL];
}

export function estimateGraphNodeCost(input: GraphNodeCostInput): GraphNodeCostEstimate {
  const pricing = getModelPricing(input.modelName);
  const inputText = [
    input.systemPrompt,
    serializeEstimatorPart(input.toolSchemas),
    serializeEstimatorPart(input.messages),
  ]
    .filter(Boolean)
    .join('\n');

  const inputTokens = estimateTextTokens(inputText);
  const outputTokens = estimateTextTokens(input.outputText ?? '');
  const estimatedCostUsd =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  };
}

function serializeEstimatorPart(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serializeEstimatorPart).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    if ('content' in value) {
      return serializeEstimatorPart((value as { content?: unknown }).content);
    }

    return JSON.stringify(value);
  }

  return String(value);
}

