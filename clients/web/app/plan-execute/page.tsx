"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

interface PipelinePlanStep {
  id: string;
  description: string;
  done: boolean;
}

interface PipelineStepResult {
  stepId: string;
  description: string;
  threadId: string;
  mode: string;
  report: string;
  graphTrace: string[];
  usedAgents: string[];
  handoffReason?: string | null;
}

interface PlanExecuteResult {
  plan: PipelinePlanStep[];
  currentStepIndex: number;
  stepResults: Record<string, PipelineStepResult>;
  reflections: string[];
  retryCount: number;
  parentThreadId: string;
  finalReport: string;
  evaluationPassed: boolean;
  evaluationReason: string;
}

const SAMPLE_TASKS = [
  {
    label: "跨工单售后",
    input:
      "联合分析 EC20240315001 和 EC20240315002 两个退货工单，判断是否存在共同风险、政策冲突和人工复核条件。",
  },
  {
    label: "复杂需求评审",
    input:
      "评估一个跨境支付需求，覆盖功能拆解、性能容量、资金安全、隐私合规和上线排期依赖。",
  },
  {
    label: "历史需求补充",
    input:
      "基于 REQ-20240315-001 的历史分析结果，补充登录、批量导入和敏感数据导出的联合风险报告。",
  },
] as const;

export default function PlanExecutePage() {
  const [input, setInput] = useState<string>(SAMPLE_TASKS[0].input);
  const [result, setResult] = useState<PlanExecuteResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const stepResults = result?.stepResults ?? {};

  async function runPipeline() {
    setLoading(true);
    setError("");

    try {
      const data = await requestPlanExecute(input);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_48%,#f4f4f5_100%)] px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Plan Execute</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              外层流水线与 Reflexion
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 text-pretty">
              planner 拆分跨任务分析，executor 调用完整 analysis graph，evaluator 判断总报告，reflector 最多修订一次。
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
          <section className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">任务输入</h2>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
                {input.length} chars
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {SAMPLE_TASKS.map((sample) => (
                <button
                  className={`min-h-24 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
                    input === sample.input
                      ? "border-zinc-950 bg-zinc-950 text-white shadow-md"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700"
                  }`}
                  key={sample.label}
                  onClick={() => setInput(sample.input)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{sample.label}</span>
                  <span className={input === sample.input ? "mt-2 block text-xs leading-5 text-zinc-300" : "mt-2 block text-xs leading-5 text-zinc-500"}>
                    Plan-and-Execute
                  </span>
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-2" htmlFor="plan-execute-input">
              <span className="text-sm font-semibold text-zinc-900">联合分析任务</span>
              <textarea
                className="min-h-64 resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-900 outline-none transition focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-200"
                id="plan-execute-input"
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
            </label>

            <button
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || !input.trim()}
              onClick={runPipeline}
              type="button"
            >
              {loading ? "流水线执行中..." : "运行 Plan Execute"}
            </button>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="retryCount" value={String(result?.retryCount ?? 0)} />
              <MetricCard label="Plan Steps" value={String(result?.plan?.length ?? 0)} />
              <MetricCard label="Evaluation" value={result ? (result.evaluationPassed ? "pass" : "review") : "-"} />
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Final Report</p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">
                {result?.finalReport || "运行后显示最终联合分析报告"}
              </p>
            </div>

            <Panel title="Plan">
              {result?.plan?.length ? (
                <ol className="flex flex-col gap-2">
                  {result.plan.map((step, index) => (
                    <li className="rounded-lg border border-zinc-200 bg-white p-3" key={step.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">
                            {index + 1}. {step.id}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-zinc-600">{step.description}</p>
                        </div>
                        <span className={step.done ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600"}>
                          {step.done ? "done" : "pending"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-zinc-500">暂无计划</p>
              )}
            </Panel>

            <Panel title="stepResults">
              {Object.values(stepResults).length ? (
                <div className="grid gap-3">
                  {Object.values(stepResults).map((step) => (
                    <article className="rounded-lg border border-zinc-200 bg-white p-3" key={step.stepId}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-950">{step.stepId}</p>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
                          {step.threadId}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
                      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                        {step.report || "无报告"}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">暂无步骤结果</p>
              )}
            </Panel>

            <Panel title="reflections">
              {result?.reflections?.length ? (
                <ul className="flex flex-col gap-2">
                  {result.reflections.map((reflection, index) => (
                    <li className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900" key={`${reflection}-${index}`}>
                      {reflection}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">暂无反思记录</p>
              )}
            </Panel>

            <pre className="min-h-56 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
              {JSON.stringify(error ? { error } : result, null, 2)}
            </pre>
          </section>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-zinc-950">{value}</p>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">{children}</div>
    </div>
  );
}

async function requestPlanExecute(input: string) {
  const response = await fetch("/api/agents/plan-execute", {
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

  return payload as PlanExecuteResult;
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
