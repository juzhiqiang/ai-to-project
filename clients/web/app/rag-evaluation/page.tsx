"use client";

import Link from "next/link";
import { useState } from "react";

type EvalRow = {
  id: string;
  label: string;
  retrieved: string;
  relevant: string;
};

let rowSeq = 0;
function makeRow(partial?: Partial<EvalRow>): EvalRow {
  rowSeq += 1;
  return {
    id: `row-${Date.now()}-${rowSeq}`,
    label: partial?.label ?? "",
    retrieved: partial?.retrieved ?? "",
    relevant: partial?.relevant ?? "",
  };
}

// 真实示例：模拟一个客服知识库 RAG 的检索结果与人工标注
const DEFAULT_ROWS: EvalRow[] = [
  makeRow({
    label: "退款政策是什么？",
    retrieved: "doc-refund-policy, doc-shipping, doc-faq",
    relevant: "doc-refund-policy",
  }),
  makeRow({
    label: "发货需要几天？",
    retrieved: "doc-shipping, doc-refund-policy, doc-contact",
    relevant: "doc-shipping",
  }),
  makeRow({
    label: "怎么联系客服？",
    retrieved: "doc-faq, doc-contact, doc-refund-policy",
    relevant: "doc-contact",
  }),
  makeRow({
    label: "保修期多长？",
    retrieved: "doc-warranty, doc-faq",
    relevant: "doc-warranty, doc-faq",
  }),
];

// 后端 /api/rag/evaluate 的响应类型
type SampleResult = {
  label: string;
  retrievedIds: string[];
  relevantIds: string[];
  recall: number;
  ndcg: number;
  firstHitRank: number | null;
  rr: number;
};

type EvaluationResponse = {
  k: number;
  count: number;
  meanRecall: number;
  meanNdcg: number;
  mrr: number;
  samples: SampleResult[];
};

function formatScore(value: number): string {
  return value.toFixed(4);
}

export default function RagEvaluationPage() {
  const [rows, setRows] = useState<EvalRow[]>(DEFAULT_ROWS);
  const [k, setK] = useState(5);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateRow(rowId: string, patch: Partial<EvalRow>) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
  }

  function parseIds(raw: string): string[] {
    return raw
      .split(/[\s,，、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleEvaluate() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/rag/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k,
          samples: rows.map((row) => ({
            label: row.label || undefined,
            retrieved: parseIds(row.retrieved),
            relevant: parseIds(row.relevant),
          })),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`,
        );
      }

      setResult((await response.json()) as EvaluationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "评测请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              9.5 RAG Evaluation
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              检索评测指标
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              输入检索结果与相关文档，由后端计算 Recall@K、MRR、NDCG@K。调用 POST /api/rag/evaluate 接口。
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 w-fit items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950"
            href="/"
          >
            返回工作台
          </Link>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(380px,0.7fr)]">
          {/* 左侧：评测集编辑 */}
          <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-base font-semibold text-zinc-950">评测集</h2>
              <div className="flex items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">K 值</span>
                  <input
                    type="number"
                    min={1}
                    className="min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                    value={k}
                    onChange={(e) =>
                      setK(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </label>
                <button
                  className="min-h-11 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
                  onClick={handleEvaluate}
                  disabled={loading || rows.length === 0}
                  type="button"
                >
                  {loading ? "计算中..." : "执行评测"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50/60 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-zinc-400">
                      查询 #{index + 1}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-zinc-400 underline-offset-2 hover:text-red-500 hover:underline disabled:opacity-40"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 1}
                    >
                      删除
                    </button>
                  </div>
                  <label className="mt-2 flex flex-col gap-1 text-sm">
                    <span className="text-zinc-600">问题描述（可选）</span>
                    <input
                      className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                      value={row.label}
                      onChange={(e) =>
                        updateRow(row.id, { label: e.target.value })
                      }
                      placeholder="例如：退款政策是什么？"
                    />
                  </label>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-600">
                        检索结果 ID（按相关度降序，逗号分隔）
                      </span>
                      <textarea
                        className="min-h-20 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs shadow-sm"
                        value={row.retrieved}
                        onChange={(e) =>
                          updateRow(row.id, { retrieved: e.target.value })
                        }
                        placeholder="doc-a, doc-b, doc-c"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-600">
                        相关文档 ID（逗号分隔）
                      </span>
                      <textarea
                        className="min-h-20 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs shadow-sm"
                        value={row.relevant}
                        onChange={(e) =>
                          updateRow(row.id, { relevant: e.target.value })
                        }
                        placeholder="doc-a, doc-b"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950"
              onClick={addRow}
            >
              + 添加查询
            </button>
          </section>

          {/* 右侧：指标结果 */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">指标结果</h2>
                <span className="text-xs text-zinc-400">
                  {result ? `${result.count} 条查询 · K = ${result.k}` : "等待计算"}
                </span>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100"
                >
                  {error}
                </p>
              )}

              {result ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <MetricTile
                      label="Mean Recall@K"
                      value={formatScore(result.meanRecall)}
                    />
                    <MetricTile label="MRR" value={formatScore(result.mrr)} />
                    <MetricTile
                      label="Mean NDCG@K"
                      value={formatScore(result.meanNdcg)}
                    />
                  </div>

                  <div className="mt-4 max-h-[30rem] space-y-2 overflow-auto">
                    {result.samples.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <p className="truncate text-xs font-medium text-zinc-300">
                          #{i + 1} {s.label}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <span className="text-zinc-400">
                            Recall@{result.k}:{" "}
                            <span className="font-mono text-emerald-300">
                              {formatScore(s.recall)}
                            </span>
                          </span>
                          <span className="text-zinc-400">
                            NDCG@{result.k}:{" "}
                            <span className="font-mono text-emerald-300">
                              {formatScore(s.ndcg)}
                            </span>
                          </span>
                          <span className="text-zinc-400">
                            首次命中:{" "}
                            <span className="font-mono text-amber-300">
                              {s.firstHitRank ?? "—"}
                            </span>
                          </span>
                          <span className="text-zinc-400">
                            RR:{" "}
                            <span className="font-mono text-amber-300">
                              {formatScore(s.rr)}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  点击「执行评测」由后端计算指标...
                </p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl tabular-nums text-emerald-300">
        {value}
      </p>
    </div>
  );
}
