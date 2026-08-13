/**
 * RAGAS 生成质量评测 Runner
 *
 * 通过 HTTP 调用团队自行封装的 RAGAS REST 服务（Python 微服务，端点 POST /evaluate）。
 * 仅在 CI 触发，不耦合到主进程；服务不可用时降级返回 null + warn，绝不阻塞主流程。
 */

/** 单条评测样本 */
export interface RagasSample {
  question: string;
  answer: string;
  contexts: string[];
  ground_truth: string;
}

/** RAGAS 服务请求体 */
export interface RagasEvaluateRequest {
  samples: RagasSample[];
  metrics: string[];
}

/** RAGAS 服务返回的指标分数 */
export type RagasEvaluateResult = Record<string, number>;

/** Runner 可配置项 */
export interface RagasRunnerOptions {
  /** RAGAS 服务完整端点 URL，默认读取 RAGAS_ENDPOINT 环境变量 */
  endpoint?: string;
  /** 单次请求超时（毫秒），默认 60 000 */
  timeoutMs?: number;
  /** 最大重试次数（含首次），默认 3 */
  maxRetries?: number;
  /** 重试之间的退避间隔（毫秒），默认 200 */
  retryDelayMs?: number;
  /** 可注入的 fetch 实现，方便测试 mock */
  fetchFn?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用 RAGAS 评测服务。
 *
 * - 超时与失败自动重试，最多 maxRetries 次。
 * - 所有尝试均失败后返回 null 并打印 warn，不抛出异常。
 *
 * @returns 指标分数对象，或 null（服务不可用时）
 */
export async function runRagasEvaluation(
  request: RagasEvaluateRequest,
  options: RagasRunnerOptions = {},
): Promise<RagasEvaluateResult | null> {
  const endpoint =
    options.endpoint ??
    process.env.RAGAS_ENDPOINT ??
    'http://localhost:8000/evaluate';
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 200;
  const fetchFn = options.fetchFn ?? fetch;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            'RAGAS 服务返回 HTTP ' + response.status,
          );
        }

        return (await response.json()) as RagasEvaluateResult;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);
  console.warn(
    '[ragas-runner] RAGAS 评测服务不可用，已降级跳过。原因: ' + reason,
  );
  return null;
}
