"use client";

import Link from "next/link";
import { useState } from "react";

type SearchResult = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  modelName: string;
  distance: number;
  score: number;
};

type SearchResponse = {
  query: string;
  dimension: number;
  count: number;
  results: SearchResult[];
};

export default function VectorDatabasePage() {
  const [query, setQuery] = useState("退款政策是什么？");
  const [topK, setTopK] = useState(5);
  const [modelName, setModelName] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          topK,
          modelName: modelName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
      }

      setResult((await response.json()) as SearchResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vector search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">RAG · 11.5</p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">向量数据库测试</h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              输入自然语言查询，由后端生成 embedding 后执行 pgvector 余弦近邻检索。
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
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">检索参数</h2>
            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">查询文本</span>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm shadow-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入要检索的自然语言查询..."
                />
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">Top K</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">模型名称（可选）</span>
                  <input
                    className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm shadow-sm sm:w-64"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="例如 test-embedding"
                  />
                </label>
                <button
                  className="min-h-11 rounded-md bg-zinc-950 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
                  disabled={loading || !query.trim()}
                  onClick={handleSearch}
                >
                  {loading ? "检索中..." : "执行检索"}
                </button>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">检索结果</h2>
                {result && <span className="text-xs text-zinc-400">{result.count} 条 · {result.dimension} 维</span>}
              </div>
              {error && <p role="alert" className="mt-3 rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
              {result ? (
                result.results.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">数据库中暂无可检索向量</p>
                ) : (
                  <div className="mt-3 max-h-[28rem] space-y-3 overflow-auto">
                    {result.results.map((result) => (
                      <div key={result.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-400">{result.documentId} · chunk {result.chunkIndex}</span>
                          <span className="font-mono tabular-nums text-emerald-300">score {result.score.toFixed(6)}</span>
                        </div>
                        <p className="mt-1.5 break-words text-sm text-zinc-200">{result.content}</p>
                        <p className="mt-1.5 font-mono text-[10px] text-zinc-500">model: {result.modelName}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="mt-3 text-sm text-zinc-500">等待检索结果...</p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
