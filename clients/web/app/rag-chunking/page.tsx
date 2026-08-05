"use client";

import { useState } from "react";

type Chunk = {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
};

type ParentChildResult = {
  parents: { parentIndex: number; content: string; childIndexes: number[] }[];
  children: { childIndex: number; parentIndex: number; content: string }[];
};

type ChunkResponse = {
  mode: "parent-child" | "normal";
  chunks: Chunk[] | ParentChildResult;
};

export default function RagChunkingPage() {
  const [text, setText] = useState("这是一个测试文档。\n\n第一段内容，用来测试我们的文档切分功能。\n\n第二段包含中文标点符号：你好，世界！这是中文；这是英文。\n\n第三段内容比较长，需要被分割成多个较小的块，以便于后续的向量化和检索。");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [chunkMode, setChunkMode] = useState<"normal" | "parent-child">("normal");
  const [result, setResult] = useState<ChunkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleChunk() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/rag/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          chunkSize,
          chunkOverlap,
          mode: chunkMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json() as ChunkResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chunk request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="border-b border-zinc-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">RAG Chunking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">文档切分测试</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            测试文本切分功能，支持普通切分和 Parent-Child 切分模式。
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">输入文本</h2>
              </div>
              <div className="flex gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">切分模式</span>
                  <select
                    className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    value={chunkMode}
                    onChange={(e) => setChunkMode(e.target.value as "normal" | "parent-child")}
                  >
                    <option value="normal">普通切分</option>
                    <option value="parent-child">Parent-Child</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">块大小</span>
                  <input
                    type="number"
                    className="min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-600">重叠大小</span>
                  <input
                    type="number"
                    min={0}
                    max={chunkSize - 1}
                    className="min-h-11 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(Number(e.target.value))}
                  />
                </label>
                <button
                  className="min-h-11 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  disabled={loading || !text.trim()}
                  onClick={handleChunk}
                >
                  {loading ? "处理中..." : "执行切分"}
                </button>
              </div>
            </div>
            <textarea
              className="mt-4 min-h-64 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入要切分的文本..."
            />
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
              <h2 className="text-base font-semibold">切分结果</h2>
              {error && (
                <p role="alert" className="mt-3 rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">
                  {error}
                </p>
              )}
              {result ? (
                <div className="mt-3 max-h-96 overflow-auto">
                  {chunkMode === "normal" && Array.isArray(result.chunks) ? (
                    <div className="space-y-3">
                      {(result.chunks as Chunk[]).map((chunk, i) => (
                        <div key={i} className="rounded border border-white/10 bg-white/5 p-3">
                          <p className="text-xs font-medium text-zinc-400">
                            Chunk {chunk.index} (offset: {chunk.startOffset}-{chunk.endOffset})
                          </p>
                          <p className="mt-1 text-sm text-zinc-200">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-zinc-400">Parents: {(result.chunks as ParentChildResult).parents.length}</p>
                        {(result.chunks as ParentChildResult).parents.slice(0, 3).map((p, i) => (
                          <div key={i} className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2">
                            <p className="text-xs text-emerald-300">Parent {p.parentIndex}</p>
                            <p className="text-xs text-emerald-200">{p.content.slice(0, 50)}...</p>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-zinc-400">Children: {(result.chunks as ParentChildResult).children.length}</p>
                        {(result.chunks as ParentChildResult).children.slice(0, 5).map((c, i) => (
                          <div key={i} className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
                            <p className="text-xs text-amber-300">Child {c.childIndex} → Parent {c.parentIndex}</p>
                            <p className="text-xs text-amber-200">{c.content.slice(0, 40)}...</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">等待切分结果...</p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
