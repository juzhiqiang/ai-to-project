"use client";

import Link from "next/link";
import { useState } from "react";

interface AgentStep {
  agent: string;
  output: string;
}

interface OrchestratorResult {
  mode: "completed" | "clarification" | "fallback";
  clarificationQuestions: string[];
  usedAgents: string[];
  fallback: "manual_review" | null;
  steps: AgentStep[];
  graphTrace?: string[];
  report: string;
  errorMessage?: string | null;
  intent?: "analyze" | "query" | "chat" | "risk_only";
  reasoning?: string | null;
  handoffReason?: string | null;
  queryResponse?: string | null;
  chatResponse?: string | null;
}

const SAMPLE_INPUTS = [
  {
    label: "Direct answer",
    intent: "chat",
    input: "你好，请用一句话说明你能帮我做什么。",
  },
  {
    label: "Analysis handoff",
    intent: "analyze",
    input: "新增批量导入 Excel 用户数据能力，单次最多 10000 行，需要评估功能拆解、风险和排期。",
  },
  {
    label: "Risk handoff",
    intent: "risk_only",
    input: "订单 EC20240315001，用户昨天签收且商品未拆封，申请退货，请重点判断政策风险和人工复核条件。",
  },
] as const;

const INTENT_META = {
  chat: {
    label: "answer",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  analyze: {
    label: "analysis",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    dotClassName: "bg-sky-500",
  },
  risk_only: {
    label: "risk_only",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-500",
  },
  query: {
    label: "query",
    className: "border-violet-200 bg-violet-50 text-violet-800",
    dotClassName: "bg-violet-500",
  },
  idle: {
    label: "waiting",
    className: "border-zinc-200 bg-zinc-50 text-zinc-600",
    dotClassName: "bg-zinc-300",
  },
} as const;

export default function TriagePage() {
  const [input, setInput] = useState<string>(SAMPLE_INPUTS[2].input);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const currentMeta = getIntentMeta(result?.intent);

  async function runTriage() {
    setLoading(true);
    setError("");

    try {
      const data = await requestOrchestrator(input);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_46%,#f4f4f5_100%)] px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Triage Handoff
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              triageNode 分诊工作台
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 text-pretty">
              answer、analysis、risk_only 三条路径在同一个工作台里对照，重点观察 handoffReason 和实际执行流。
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
          <section className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-900">样例</h2>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
                  {SAMPLE_INPUTS.length} paths
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {SAMPLE_INPUTS.map((sample) => (
                  <button
                    className={`min-h-28 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
                      input === sample.input
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-md"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700"
                    }`}
                    key={sample.label}
                    onClick={() => setInput(sample.input)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold">{sample.label}</span>
                    <span
                      className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        input === sample.input ? "border-white/20 bg-white/10 text-white" : getIntentMeta(sample.intent).className
                      }`}
                    >
                      {sample.intent}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2" htmlFor="triage-input">
              <span className="text-sm font-semibold text-zinc-900">输入</span>
              <textarea
                className="min-h-60 resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-900 outline-none transition placeholder:text-zinc-500 focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-200"
                id="triage-input"
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || !input.trim()}
                onClick={runTriage}
                type="button"
              >
                {loading ? "分诊中..." : "运行 triage"}
              </button>
              <span className="text-xs leading-5 text-zinc-500">
                {input.length} chars
              </span>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              {SAMPLE_INPUTS.map((sample) => (
                <article className="rounded-lg border border-zinc-200 bg-white p-3" key={sample.label}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-950">{sample.label}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getIntentMeta(sample.intent).className}`}>
                      {sample.intent}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{sample.input}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Current Route</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${currentMeta.dotClassName}`} />
                    <p className="text-xl font-semibold tracking-tight">{currentMeta.label}</p>
                  </div>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${currentMeta.className}`}>
                  {result?.mode ?? "idle"}
                </span>
              </div>
              <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-300">
                {result?.handoffReason || "运行后显示分诊交接理由"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Intent" value={result?.intent ?? "-"} meta={currentMeta} />
              <MetricCard label="Mode" value={result?.mode ?? "-"} />
              <MetricCard label="Fallback" value={result?.fallback ?? "-"} />
              <MetricCard label="Trace" value={result?.graphTrace?.length ? `${result.graphTrace.length} nodes` : "-"} />
            </div>

            <ResultBlock title="handoffReason" value={result?.handoffReason ?? "等待分诊结果"} />
            <ResultBlock title="Direct response" value={result?.chatResponse ?? result?.queryResponse ?? "无直接回复"} />
            <ResultBlock title="Report" value={result?.report ?? "运行后显示最终输出"} />

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Graph Trace</h2>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                {result?.graphTrace?.length ? (
                  <ol className="flex flex-col gap-2">
                    {result.graphTrace.map((nodeName, index) => (
                      <li className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700" key={`${nodeName}-${index}`}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <span className="break-all font-medium text-zinc-800">{nodeName}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-zinc-500">暂无 trace</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Steps</h2>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                {result?.steps?.length ? (
                  <ol className="flex flex-col gap-3">
                    {result.steps.map((step, index) => (
                      <li className="rounded-lg border border-zinc-200 bg-white p-3" key={`${step.agent}-${index}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Step {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-medium text-zinc-950">{step.agent}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                          {step.output}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-zinc-500">暂无业务步骤</p>
                )}
              </div>
            </div>

            <pre className="min-h-56 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              {JSON.stringify(error ? { error } : result, null, 2)}
            </pre>
          </section>
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: (typeof INTENT_META)[keyof typeof INTENT_META];
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {meta ? <span className={`h-2 w-2 rounded-full ${meta.dotClassName}`} /> : null}
        <p className="text-sm font-medium text-zinc-950">{value}</p>
      </div>
    </article>
  );
}

function ResultBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
        <p className="whitespace-pre-wrap break-words">{value}</p>
      </div>
    </div>
  );
}

async function requestOrchestrator(input: string) {
  const response = await fetch("/api/agents/orchestrate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });
  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, response.status));
  }

  return payload as OrchestratorResult;
}

function parseJsonResponse(responseText: string): unknown {
  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return { error: responseText };
  }
}

function errorMessageFromPayload(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = typeof record.detail === "string" ? record.detail : undefined;
    const error = typeof record.error === "string" ? record.error : undefined;
    const message = typeof record.message === "string" ? record.message : undefined;

    return detail ?? error ?? message ?? `Request failed with status ${status}`;
  }

  return `Request failed with status ${status}`;
}

function getIntentMeta(intent: OrchestratorResult["intent"] | undefined) {
  return intent ? INTENT_META[intent] : INTENT_META.idle;
}
