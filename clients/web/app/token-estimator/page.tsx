"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ModelPricing = {
  input: number;
  output: number;
  cachedInput?: number;
};

type EstimateResponse = {
  nodeName: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  pricing: ModelPricing;
  outputText: string;
  mode: "live";
  configuredModel: string;
};

type RequestStatus = "idle" | "loading" | "success" | "error";

const DEFAULT_SYSTEM_PROMPT =
  "你是需求分析 Supervisor。请判断该需求需要哪些专家参与，并给出清晰的 handoff reason。";
const DEFAULT_MESSAGES =
  "用户希望新增企业审批流：不同金额走不同审批链路，需要审计日志、权限隔离，并支持 2 秒内返回审批状态。";
const DEFAULT_TOOL_SCHEMAS = JSON.stringify(
  [
    {
      name: "handoff_to_functional_expert",
      description: "Transfer functional requirement analysis to the functional expert.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
    },
    {
      name: "handoff_to_security_expert",
      description: "Transfer security analysis to the security expert.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
    },
  ],
  null,
  2,
);
const DEFAULT_OUTPUT = "建议启用 functional、security、performance 三位专家，并在 aggregator 中合并约束。";

const TEST_CHECKS = [
  "真实调用后端配置的模型（不在页面上选择模型）",
  "token 来自 provider 实际返回的 usage_metadata",
  "成本按后端价格表 × 真实 token 计算",
  "带 toolSchemas 的请求 > 不带 toolSchemas",
] as const;

const SCENARIOS = [
  {
    name: "短需求",
    systemPrompt: "你是需求分类器。",
    messages: "用户注册时必须绑定手机号，密码至少 8 位。",
    toolSchemas: "",
    outputText: "启用 functional expert。",
  },
  {
    name: "四专家全开",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    messages:
      "金融客户需要新增跨境付款审批、风险阈值、PII 脱敏、合规留痕、峰值吞吐和失败补偿策略。",
    toolSchemas: DEFAULT_TOOL_SCHEMAS,
    outputText: "启用 functional、performance、security、compliance 四位专家。",
  },
] as const;

export default function TokenEstimatorPage() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);
  const [toolSchemas, setToolSchemas] = useState(DEFAULT_TOOL_SCHEMAS);
  const [outputText, setOutputText] = useState(DEFAULT_OUTPUT);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState("");

  const parsedTools = safeParseJson(toolSchemas);
  const pricing = estimate?.pricing;
  const inputCostUsd = estimate && pricing ? (estimate.inputTokens * pricing.input) / 1_000_000 : 0;
  const outputCostUsd = estimate && pricing ? (estimate.outputTokens * pricing.output) / 1_000_000 : 0;
  const totalTokens = (estimate?.inputTokens ?? 0) + (estimate?.outputTokens ?? 0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestEstimate(controller.signal);
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [messages, outputText, systemPrompt, toolSchemas]);

  async function requestEstimate(signal?: AbortSignal) {
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/cost/token-estimate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nodeName: "token-estimator-playground",
          systemPrompt,
          toolSchemas: parsedTools.ok ? parsedTools.value : toolSchemas,
          messages: [messages],
          outputText,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as EstimateResponse;
      setEstimate(data);
      setStatus("success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setStatus("error");
      setError(err instanceof Error ? err.message : "Token estimator request failed");
    }
  }

  function applyScenario(index: number) {
    const scenario = SCENARIOS[index];
    setSystemPrompt(scenario.systemPrompt);
    setMessages(scenario.messages);
    setToolSchemas(scenario.toolSchemas);
    setOutputText(scenario.outputText);
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-4xl flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Token Cost Estimator
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              LangGraph Multi-Agent 设计期成本估算
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 text-pretty">
              这里不再选择模型：请求会真实调用后端 config/langchain.yaml 配置的模型，并直接读取 provider
              实际返回的 token usage 计算成本。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 w-fit items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              href="/analysis-graph"
            >
              Supervisor Playground
            </Link>
            <Link
              className="inline-flex min-h-11 w-fit items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              href="/"
            >
              返回首页
            </Link>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-5">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">估算输入</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    请求体会发送到 `/api/cost/token-estimate`，由后端真实调用模型并用返回结果计算。
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex min-w-56 flex-col gap-2 text-sm font-medium text-zinc-700">
                    <span>后端模型</span>
                    <span className="inline-flex min-h-11 items-center rounded-md border border-zinc-200 bg-zinc-100 px-3 text-sm font-mono text-zinc-900">
                      {estimate?.modelName ?? "读取中..."}
                    </span>
                  </div>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={status === "loading"}
                    onClick={() => requestEstimate()}
                    type="button"
                  >
                    {status === "loading" ? "调用中..." : "真实调用计算"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <TextAreaField
                  id="system-prompt"
                  label="systemPrompt"
                  minHeight="min-h-28"
                  value={systemPrompt}
                  onChange={setSystemPrompt}
                />
                <TextAreaField
                  id="tool-schemas"
                  label="toolSchemas"
                  minHeight="min-h-52"
                  value={toolSchemas}
                  onChange={setToolSchemas}
                />
                {!parsedTools.ok ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                    toolSchemas 不是合法 JSON，本次请求会按普通文本传给后端，便于测试异常输入。
                  </p>
                ) : null}
                <TextAreaField
                  id="messages"
                  label="messages"
                  minHeight="min-h-32"
                  value={messages}
                  onChange={setMessages}
                />
                <TextAreaField
                  id="output-text"
                  label="outputText"
                  minHeight="min-h-28"
                  value={outputText}
                  onChange={setOutputText}
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              {SCENARIOS.map((scenario, index) => (
                <button
                  className="min-h-24 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-950 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  key={scenario.name}
                  onClick={() => applyScenario(index)}
                  type="button"
                >
                  <span className="text-sm font-semibold text-zinc-950">{scenario.name}</span>
                  <span className="mt-2 block text-sm leading-6 text-zinc-600">
                    一键填入测试数据，观察真实接口返回的 token 与成本变化。
                  </span>
                </button>
              ))}
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Live Estimate</p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    {estimate ? formatUsd(estimate.estimatedCostUsd) : "--"}
                  </h2>
                  {estimate ? (
                    <p className="mt-1 font-mono text-xs text-zinc-400">{estimate.modelName}</p>
                  ) : null}
                </div>
                <span className={statusClassName(status)}>{status}</span>
              </div>
              {error ? (
                <p className="mt-4 rounded-md border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm leading-6 text-red-100">
                  {error}
                </p>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="inputTokens" value={estimate ? estimate.inputTokens.toLocaleString() : "--"} />
                <Metric label="outputTokens" value={estimate ? estimate.outputTokens.toLocaleString() : "--"} />
                <Metric label="input cost" value={estimate ? formatUsd(inputCostUsd) : "--"} />
                <Metric label="output cost" value={estimate ? formatUsd(outputCostUsd) : "--"} />
              </div>
              <div className="mt-5">
                <CostBar label="inputTokens" value={estimate?.inputTokens ?? 0} total={totalTokens} />
                <CostBar label="outputTokens" value={estimate?.outputTokens ?? 0} total={totalTokens} />
              </div>
              {estimate?.outputText ? (
                <p className="mt-5 line-clamp-3 rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-zinc-300">
                  {estimate.outputText}
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">后端定价</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                模型与价格均由后端决定（来自 config/langchain.yaml 与价格表）。以上价格示例自 2025-2026
                年早期，仅供参考；上线前请以厂商官网为准。
              </p>
              {pricing ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">model</th>
                        <th className="px-3 py-2 font-medium">input</th>
                        <th className="px-3 py-2 font-medium">output</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      <tr className="bg-sky-50">
                        <td className="px-3 py-2 font-mono font-medium text-zinc-900">{estimate?.modelName}</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-700">{pricing.input}</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-700">{pricing.output}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-zinc-500">等待后端返回模型与价格。</p>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">测试检查点</h2>
              <ul className="mt-4 flex flex-col gap-2">
                {TEST_CHECKS.map((check) => (
                  <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700" key={check}>
                    {check}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">调试输出</h2>
              <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-800">
                {JSON.stringify(
                  estimate ?? {
                    inputTokens: 0,
                    outputTokens: 0,
                    estimatedCostUsd: 0,
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function TextAreaField({
  id,
  label,
  minHeight,
  value,
  onChange,
}: {
  id: string;
  label: string;
  minHeight: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700" htmlFor={id}>
      {label}
      <textarea
        className={`${minHeight} resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-sm leading-6 text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200`}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-2 font-mono text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function CostBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.max(4, Math.min(100, Math.round((value / total) * 100)));

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-300">
        <span>{label}</span>
        <span className="font-mono">{value.toLocaleString()} tokens</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-300 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function safeParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value.trim()) {
    return { ok: true, value: "" };
  }

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function statusClassName(status: RequestStatus) {
  if (status === "success") {
    return "rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100";
  }

  if (status === "loading") {
    return "rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100";
  }

  if (status === "error") {
    return "rounded-full border border-red-300/30 bg-red-400/10 px-3 py-1 text-xs font-medium text-red-100";
  }

  return "rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200";
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
}
