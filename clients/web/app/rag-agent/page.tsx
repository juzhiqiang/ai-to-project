"use client";

import Link from "next/link";
import { useState } from "react";

type Citation = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  score: number;
};

type RagAnswer = {
  answer: string;
  citations: Citation[];
  generated: boolean;
};

type BudgetExceeded = {
  error: "budget_exceeded";
  reason: string;
};

type AgentResponse = {
  question: string;
  topK: number;
  budgetUsedPercent: number;
  budgetAction: string;
  budgetReason: string;
  result: RagAnswer | BudgetExceeded;
};

function isBudgetExceeded(
  result: RagAnswer | BudgetExceeded,
): result is BudgetExceeded {
  return typeof (result as BudgetExceeded).error === "string";
}

export default function RagAgentPage() {
  const [question, setQuestion] = useState("退货政策是什么？");
  const [topK, setTopK] = useState(4);
  const [budgetUsedPercent, setBudgetUsedPercent] = useState(0);
  const [generate, setGenerate] = useState(true);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk() {
    setLoading(true);
    setError("");
    setResponse(null);

    try {
      const res = await fetch("/api/rag/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          topK,
          budgetUsedPercent,
          generate,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`,
        );
      }

      setResponse((await res.json()) as AgentResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "RAG Agent 请求失败");
    } finally {
      setLoading(false);
    }
  }

  const budgetBadge = (action: string) => {
    if (action === "reject") {
      return "rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700";
    }
    return "rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700";
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              9.6 RAG Tool × Agent
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              RAG 工具集成测试
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              真实调用后端：问题 → embedding 向量化 → pgvector
              检索 → 可选 LLM
              生成。调节预算百分比可观察工具的允许 / 拒绝行为（第十章预算控制）。
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 w-fit items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950"
            href="/"
          >
            返回工作台
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* 左侧：输入面板 */}
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">
              检索参数
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">问题</span>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm shadow-sm"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="输入要检索到知识库的问题..."
                />
              </label>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">Top K</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">预算使用率 (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={10}
                    className="min-h-11 w-32 rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                    value={budgetUsedPercent}
                    onChange={(e) =>
                      setBudgetUsedPercent(Number(e.target.value))
                    }
                  />
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                    checked={generate}
                    onChange={(e) => setGenerate(e.target.checked)}
                  />
                  LLM 生成回答
                </label>

                <button
                  className="min-h-11 rounded-md bg-zinc-950 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
                  disabled={loading || !question.trim()}
                  onClick={handleAsk}
                >
                  {loading ? "检索中..." : "执行检索"}
                </button>
              </div>

              <p className="text-xs leading-5 text-zinc-400">
                预算 ≥ 100% 时 functional_expert 角色会被拒绝（返回
                budget_exceeded）；&lt; 80% 时允许。这是第十章预算控制在 RAG
                工具上的真实体现。
              </p>
            </div>
          </section>

          {/* 右侧：结果面板 */}
          <aside className="flex flex-col gap-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {response && (
              <>
                <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-zinc-950">
                      预算决策
                    </h2>
                    <span className={budgetBadge(response.budgetAction)}>
                      {response.budgetAction} · {response.budgetUsedPercent}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {response.budgetReason}
                  </p>
                </section>

                {isBudgetExceeded(response.result) ? (
                  <section className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-red-800">
                      工具被拒绝
                    </h2>
                    <p className="mt-2 text-sm text-red-700">
                      {response.result.error}: {response.result.reason}
                    </p>
                    <p className="mt-1 text-xs text-red-500">
                      ragAsk 未被调用 —
                      预算检查在最前面拦截，避免了昂贵的检索与生成。
                    </p>
                  </section>
                ) : (
                  <>
                    <section className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold">回答</h2>
                        <span className="text-xs text-zinc-400">
                          {response.result.generated
                            ? "LLM 生成"
                            : "检索拼接"}
                          {" · "}
                          {response.result.citations.length} 条引用
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
                        {response.result.answer}
                      </p>
                    </section>

                    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                      <h2 className="text-base font-semibold text-zinc-950">
                        引用来源
                      </h2>
                      <div className="mt-3 max-h-72 space-y-3 overflow-auto">
                        {response.result.citations.map((citation, index) => (
                          <div
                            key={citation.id}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-500">
                                #{index + 1} · {citation.documentId} · chunk{" "}
                                {citation.chunkIndex}
                              </span>
                              <span className="font-mono tabular-nums text-emerald-600">
                                score {citation.score.toFixed(4)}
                              </span>
                            </div>
                            <p className="mt-1.5 break-words text-sm text-zinc-700">
                              {citation.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}

            {!response && !error && (
              <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-zinc-400">
                  等待执行检索... 输入问题并点击「执行检索」开始真实测试。
                </p>
              </section>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

