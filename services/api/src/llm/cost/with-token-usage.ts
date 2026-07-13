import type { TokenUsageService } from './token-usage.service';
import { getModelPricing } from './token-estimator';
import { estimateTextTokens } from './token-estimator';

export interface WithTokenUsageOptions {
  graphName: string;
  nodeName: string;
  agentName: string;
  modelName: string;
  modelConfigId?: string | null;
  provider?: string;
  conversationId?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  overrideReason?: string | null;
}

/**
 * 包装函数，为模型调用添加 Token usage 采集和持久化。
 * 失败不阻塞主流程：usageService 为 null 或 recordUsage 抛错时仍返回原始结果。
 */
export async function withTokenUsage<T>(
  options: WithTokenUsageOptions,
  usageService: TokenUsageService | null,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  // 直接执行函数获取结果
  const result = await fn();

  // 如果没有 usageService，跳过记录
  if (!usageService) {
    return result;
  }

  // 尝试从响应中提取 usage
  const usage = extractUsage(result);
  const latencyMs = Date.now() - start;

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let isEstimated = false;

  if (usage) {
    // 优先使用 provider 返回的真实 usage
    inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
    cachedInputTokens = usage.cache_read_input_tokens ?? usage.cached_tokens ?? 0;
    isEstimated = false;
  } else {
    // 兜底估算：outputTokens = estimateTextTokens(result.content || result.text || '')
    // inputTokens = outputTokens × 5（注释说明依据来自 10.2 真实样本，约 5.8:1 取保守圆整）
    const outputText = typeof result.content === 'string' ? result.content : (result.text ?? '');
    outputTokens = estimateTextTokens(outputText);
    inputTokens = outputTokens * 5;
    isEstimated = true;
  }

  // 用 getModelPricing 计算 estimatedCostUsd
  const pricing = getModelPricing(options.modelName);
  const inputCost = (inputTokens * (pricing.cachedInput ?? pricing.input)) / 1_000_000;
  const outputCost = (outputTokens * pricing.output) / 1_000_000;
  const cachedCost = (cachedInputTokens * (pricing.cachedInput ?? pricing.input)) / 1_000_000;
  const estimatedCostUsd = inputCost + outputCost - cachedCost;

  // 构造记录并持久化，任何异常只 console.warn 不向上抛
  const record = {
    graphName: options.graphName,
    nodeName: options.nodeName,
    agentName: options.agentName,
    modelConfigId: options.modelConfigId,
    modelName: options.modelName,
    provider: options.provider ?? 'openai',
    conversationId: options.conversationId,
    messageId: options.messageId,
    threadId: options.threadId,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    estimatedCostUsd,
    isEstimated,
    latencyMs,
    overrideReason: options.overrideReason,
  };

  try {
    await usageService.recordUsage(record);
  } catch (error) {
    console.warn('[withTokenUsage] Failed to record usage:', error);
  }

  return result;
}

/**
 * 从 LangChain/OpenAI 响应中提取 usage 元数据。
 * 兼容 OpenAI 风格的 response_metadata.usage 和 LangChain v2 的 usage_metadata。
 */
function extractUsage(
  result: unknown,
): { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number; cache_read_input_tokens?: number; cached_tokens?: number } | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const res = result as Record<string, unknown>;

  // LangChain v2: result.usage_metadata
  if (res.usage_metadata && typeof res.usage_metadata === 'object') {
    const um = res.usage_metadata as Record<string, unknown>;
    return {
      input_tokens: um.input_tokens as number,
      output_tokens: um.output_tokens as number,
    };
  }

  // OpenAI 风格: result.response_metadata?.usage
  if (res.response_metadata && typeof res.response_metadata === 'object') {
    const rm = res.response_metadata as Record<string, unknown>;
    if (rm.usage && typeof rm.usage === 'object') {
      const u = rm.usage as Record<string, unknown>;
      return {
        prompt_tokens: u.prompt_tokens as number,
        completion_tokens: u.completion_tokens as number,
        cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens as number,
      };
    }
  }

  // 直接在 result 上有 usage (部分 LangChain 版本)
  if (res.usage && typeof res.usage === 'object') {
    const u = res.usage as Record<string, unknown>;
    return {
      input_tokens: u.input_tokens as number,
      output_tokens: u.output_tokens as number,
    };
  }

  return null;
}
