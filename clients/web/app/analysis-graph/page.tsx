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
  intent?: "analyze" | "query" | "chat";
  reasoning?: string | null;
  queryResponse?: string | null;
  chatResponse?: string | null;
}

type TraceTone = "active" | "warn" | "idle";

interface TraceItem {
  title: string;
  description: string;
  tone: TraceTone;
}

const DEFAULT_CASES = [
  {
    label: "普通需求",
    input: "新增个人资料编辑能力，支持昵称与头像修改。",
  },
  {
    label: "REQ 查询型分析",
    input: "分析 REQ-500，补充登录能力并给出拆解方案。",
  },
  {
    label: "认证冲突",
    input: "分析 REQ-200，新增登录、密码校验和单点登录能力。",
  },
] as const;

const TRACE_NODE_LABEL: Record<string, string> = {
  agent: "ReAct agent",
  tools: "工具节点",
  finalize: "结果收敛",
};

const TRACE_NODE_DESCRIPTION: Record<string, string> = {
  agent: "分析子图调用绑定工具的模型，判断是否需要继续检索或直接输出分析。",
  tools: "ToolNode 执行模型请求的工具调用，例如 search_requirement 或 check_conflicts。",
  finalize: "子图将最后一次 AI 输出收敛为 analysisResult，并交回父图继续风险与摘要节点。",
};

export default function AnalysisGraphPage() {
  const [input, setInput] = useState<string>(DEFAULT_CASES[0].input);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const traceItems = buildTraceItems(result);

  async function runGraph() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/agents/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as OrchestratorResult;
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-zinc-500">
              Analysis Graph Playground
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">ReAct 分析子图测试台</h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              这个页面直接调用 <code>/api/agents/orchestrate</code>，用于验证需求分析父图、ReAct
              工具循环、冲突检测和最终报告输出。
            </p>
          </div>
          <Link
            className="inline-flex w-fit items-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
            href="/"
          >
            返回首页
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]">
          <section className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">预置样例</h2>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CASES.map((item) => (
                  <button
                    key={item.label}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950"
                    onClick={() => setInput(item.input)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2" htmlFor="analysis-graph-input">
              <span className="text-sm font-semibold text-zinc-900">输入需求</span>
              <textarea
                id="analysis-graph-input"
                className="min-h-52 resize-y rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || !input.trim()}
                onClick={runGraph}
                type="button"
              >
                {loading ? "执行中..." : "运行分析图"}
              </button>
              <p className="text-xs text-zinc-500">建议先试 REQ-500 和 REQ-200 两个样例。</p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            {result?.mode === "fallback" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                <p className="font-semibold text-amber-950">后端执行失败，已回退到人工处理</p>
                <p className="mt-1 break-words">{result.errorMessage ?? "后端未返回具体错误原因，请查看 API 日志。"}</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Intent" value={result?.intent ?? "-"} />
              <MetricCard label="Mode" value={result?.mode ?? "-"} />
              <MetricCard label="Fallback" value={result?.fallback ?? "-"} />
              <MetricCard
                label="真实 Graph Trace"
                value={result?.graphTrace?.length ? `${result.graphTrace.length} 个节点` : "暂无"}
              />
            </div>

            <ResultBlock title="分析结论" value={result?.report ?? "运行后会在这里展示最终报告。"} />
            <ResultBlock title="路由原因" value={result?.reasoning ?? "暂无"} />

            <TracePanel items={traceItems} />

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">澄清问题</h2>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
                {result?.clarificationQuestions?.length ? (
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {result.clarificationQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                ) : (
                  "暂无"
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">执行步骤</h2>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                {result?.steps?.length ? (
                  <ol className="flex flex-col gap-3">
                    {result.steps.map((step, index) => (
                      <li key={`${step.agent}-${index}`} className="rounded-lg border border-zinc-200 bg-white p-3">
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
                  <p className="text-sm text-zinc-500">运行后会显示 graph 经过的业务步骤。</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">原始 JSON</h2>
              <pre className="min-h-56 overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
                {JSON.stringify(error ? { error } : result, null, 2)}
              </pre>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-zinc-950">{value}</p>
    </article>
  );
}

function ResultBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
        <p className="whitespace-pre-wrap break-words">{value}</p>
      </div>
    </div>
  );
}

function TracePanel({ items }: { items: TraceItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-900">执行轨迹</h2>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotClassName(item.tone)}`} />
                {index < items.length - 1 ? <span className="mt-2 h-full w-px bg-zinc-200" /> : null}
              </div>
              <div className="flex-1 rounded-lg border border-zinc-200 bg-white p-3">
                <p className="text-sm font-medium text-zinc-950">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function buildTraceItems(result: OrchestratorResult | null): TraceItem[] {
  if (!result) {
    return [
      {
        title: "等待执行",
        description: "运行分析图后，这里会优先展示后端返回的 graphTrace。",
        tone: "idle",
      },
      {
        title: "未触发工具链",
        description: "如果子图没有进入工具循环，这里会明确显示为未触发工具链。",
        tone: "idle",
      },
    ];
  }

  if (result.graphTrace?.length) {
    return [
      {
        title: `命中路由：${result.intent ?? "unknown"}`,
        description: result.reasoning ?? "无路由原因说明。",
        tone: "active",
      },
      ...result.graphTrace.map((nodeName, index) => ({
        title: `Graph Trace ${index + 1}: ${TRACE_NODE_LABEL[nodeName] ?? nodeName}`,
        description: TRACE_NODE_DESCRIPTION[nodeName] ?? `后端真实返回的子图节点：${nodeName}`,
        tone: "active" as const,
      })),
      buildResultTraceItem(result),
    ];
  }

  const items: TraceItem[] = [
    {
      title: `命中路由：${result.intent ?? "unknown"}`,
      description: result.reasoning ?? "无路由原因说明。",
      tone: "active",
    },
  ];

  if (result.steps.length > 0) {
    for (const step of result.steps) {
      items.push({
        title: `步骤：${step.agent}`,
        description: step.output,
        tone: "active",
      });
    }
  } else {
    items.push({
      title: "未触发业务步骤",
      description: "当前结果没有返回任何业务步骤，通常说明请求在更早的分支结束了。",
      tone: "warn",
    });
  }

  items.push({
    title: "未返回真实 graphTrace",
    description: "当前响应没有 graphTrace 字段，页面已退回到基于 steps 的兼容展示。",
    tone: "idle",
  });
  items.push(buildResultTraceItem(result));

  return items;
}

function buildResultTraceItem(result: OrchestratorResult): TraceItem {
  if (result.mode === "clarification") {
    return {
      title: "结果：需要补充信息",
      description: "当前请求缺少关键信息，图已停在澄清分支。",
      tone: "warn",
    };
  }

  if (result.mode === "fallback") {
    return {
      title: "结果：回退到人工处理",
      description: "执行过程中发生异常，图已回退到手动审查路径。",
      tone: "warn",
    };
  }

  return {
    title: "结果：执行完成",
    description: "当前请求已完成分析，可以结合最终报告继续验证输出质量。",
    tone: "active",
  };
}

function dotClassName(tone: TraceTone) {
  if (tone === "active") {
    return "bg-zinc-950";
  }

  if (tone === "warn") {
    return "bg-amber-500";
  }

  return "bg-zinc-300";
}
