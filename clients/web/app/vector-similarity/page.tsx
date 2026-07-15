"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  cosineSimilarity,
  dot,
  euclideanDistance,
  l2Norm,
  normalize,
  parseVector,
} from "../../src/lib/similarity";

type Scenario = {
  name: string;
  description: string;
  vectorA: string;
  vectorB: string;
  expected: string;
};

const SCENARIOS: Scenario[] = [
  {
    name: "单位向量自相似",
    description: "同一单位向量余弦相似度应为 1",
    vectorA: "1, 0, 0",
    vectorB: "1, 0, 0",
    expected: "cosine ≈ 1",
  },
  {
    name: "反方向向量",
    description: "方向相反时余弦相似度应为 -1",
    vectorA: "1, 0",
    vectorB: "-1, 0",
    expected: "cosine ≈ -1",
  },
  {
    name: "正交向量",
    description: "互相垂直时余弦相似度为 0",
    vectorA: "1, 0",
    vectorB: "0, 1",
    expected: "cosine ≈ 0",
  },
  {
    name: "归一化后 cosine = dot",
    description: "L2 归一化后点积等于余弦相似度",
    vectorA: "3, 4",
    vectorB: "1, 2",
    expected: "|cosine − dot(na, nb)| ≤ 1e-9",
  },
  {
    name: "维度不匹配",
    description: "长度不一致应抛 RangeError",
    vectorA: "1, 2",
    vectorB: "1, 2, 3",
    expected: "RangeError: 向量维度不匹配",
  },
];

type ComputeOk = {
  ok: true;
  a: number[];
  b: number[];
  cosine: number;
  euclidean: number;
  product: number;
  normA: number;
  normB: number;
  na: number[];
  nb: number[];
  normalizedDot: number;
  proofDiff: number;
};

type ComputeErr = {
  ok: false;
  error: string;
};

type ComputeResult = ComputeOk | ComputeErr;

function compute(textA: string, textB: string): ComputeResult {
  try {
    const a = parseVector(textA);
    const b = parseVector(textB);
    const na = normalize(a);
    const nb = normalize(b);
    const cosine = cosineSimilarity(a, b);
    const normalizedDot = dot(na, nb);
    return {
      ok: true,
      a,
      b,
      cosine,
      euclidean: euclideanDistance(a, b),
      product: dot(a, b),
      normA: l2Norm(a),
      normB: l2Norm(b),
      na,
      nb,
      normalizedDot,
      proofDiff: Math.abs(cosine - normalizedDot),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatVec(v: number[], digits = 4): string {
  return `[${v.map((x) => x.toFixed(digits)).join(", ")}]`;
}

function cosineBarWidth(cosine: number): number {
  // map [-1, 1] -> [0, 100]
  return ((cosine + 1) / 2) * 100;
}

function cosineColor(cosine: number): string {
  if (cosine >= 0.7) return "bg-emerald-500";
  if (cosine >= 0.3) return "bg-sky-500";
  if (cosine >= -0.3) return "bg-zinc-400";
  if (cosine >= -0.7) return "bg-amber-500";
  return "bg-rose-500";
}

/** 2D 向量平面可视化（取前两维） */
function VectorPlane({ a, b }: { a: number[]; b: number[] }) {
  const size = 280;
  const pad = 24;
  const half = size / 2;

  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;

  const maxAbs = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(bx), Math.abs(by), 1);
  const scale = (half - pad) / maxAbs;

  const toX = (x: number) => half + x * scale;
  const toY = (y: number) => half - y * scale;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-auto w-full max-w-[280px] rounded-lg border border-zinc-200 bg-white shadow-sm"
      role="img"
      aria-label="二维向量平面"
    >
      {/* grid */}
      <line x1={0} y1={half} x2={size} y2={half} stroke="#e4e4e7" strokeWidth={1} />
      <line x1={half} y1={0} x2={half} y2={size} stroke="#e4e4e7" strokeWidth={1} />
      <circle cx={half} cy={half} r={1.5} fill="#a1a1aa" />

      {/* unit circle hint when both near unit */}
      <circle
        cx={half}
        cy={half}
        r={scale}
        fill="none"
        stroke="#f4f4f5"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* vector A */}
      <line
        x1={half}
        y1={half}
        x2={toX(ax)}
        y2={toY(ay)}
        stroke="#2563eb"
        strokeWidth={2.5}
        markerEnd="url(#arrowA)"
      />
      {/* vector B */}
      <line
        x1={half}
        y1={half}
        x2={toX(bx)}
        y2={toY(by)}
        stroke="#dc2626"
        strokeWidth={2.5}
        markerEnd="url(#arrowB)"
      />

      <defs>
        <marker id="arrowA" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb" />
        </marker>
        <marker id="arrowB" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" />
        </marker>
      </defs>

      <text x={toX(ax) + 6} y={toY(ay) - 6} fill="#2563eb" fontSize="11" fontWeight="600">
        A
      </text>
      <text x={toX(bx) + 6} y={toY(by) - 6} fill="#dc2626" fontSize="11" fontWeight="600">
        B
      </text>
      <text x={size - 18} y={half - 6} fill="#a1a1aa" fontSize="10">
        x
      </text>
      <text x={half + 6} y={14} fill="#a1a1aa" fontSize="10">
        y
      </text>
    </svg>
  );
}

export default function VectorSimilarityPage() {
  const [textA, setTextA] = useState("3, 4");
  const [textB, setTextB] = useState("1, 2");
  const [activeScenario, setActiveScenario] = useState<string | null>("归一化后 cosine = dot");

  const result = useMemo(() => compute(textA, textB), [textA, textB]);

  function applyScenario(s: Scenario) {
    setTextA(s.vectorA);
    setTextB(s.vectorB);
    setActiveScenario(s.name);
  }

  const is2d =
    result.ok &&
    (result.a.length === 2 || result.a.length >= 2) &&
    (result.b.length === 2 || result.b.length >= 2);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_50%,#f4f4f5_100%)] px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              RAG · 11.2.4
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              向量相似度可视化测试
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 text-pretty">
              零依赖纯函数演示：点积、L2 范数、归一化、余弦相似度、欧氏距离。验证「L2 归一化后
              cosine = dot」。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 w-fit items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              href="/"
            >
              返回工作台
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* 输入区 */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">输入向量</h2>
              <p className="mb-4 text-xs text-zinc-500">
                用逗号或空格分隔，例如 <code className="rounded bg-zinc-100 px-1">3, 4</code> 或{" "}
                <code className="rounded bg-zinc-100 px-1">1 0 0</code>
              </p>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-blue-700">向量 A</span>
                  <input
                    id="vector-a"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                    value={textA}
                    onChange={(e) => {
                      setTextA(e.target.value);
                      setActiveScenario(null);
                    }}
                    spellCheck={false}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-red-700">向量 B</span>
                  <input
                    id="vector-b"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                    value={textB}
                    onChange={(e) => {
                      setTextB(e.target.value);
                      setActiveScenario(null);
                    }}
                    spellCheck={false}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">预设用例（与单元测试对齐）</h2>
              <ul className="flex flex-col gap-2">
                {SCENARIOS.map((s) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => applyScenario(s)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        activeScenario === s.name
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-400"
                      }`}
                    >
                      <div className="text-sm font-medium">{s.name}</div>
                      <div
                        className={`mt-0.5 text-xs ${
                          activeScenario === s.name ? "text-zinc-300" : "text-zinc-500"
                        }`}
                      >
                        {s.description} · 期望 {s.expected}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 结果区 */}
          <div className="flex flex-col gap-4">
            {!result.ok ? (
              <div
                className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm"
                role="alert"
              >
                <h2 className="text-base font-semibold text-rose-800">计算失败</h2>
                <p className="mt-2 font-mono text-sm text-rose-700">{result.error}</p>
                <p className="mt-3 text-xs text-rose-600">
                  维度不一致时抛出 <code>RangeError(&apos;向量维度不匹配&apos;)</code>
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 text-base font-semibold">相似度指标</h2>

                  <div className="mb-4">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">余弦相似度</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {result.cosine.toFixed(9)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full transition-all ${cosineColor(result.cosine)}`}
                        style={{ width: `${cosineBarWidth(result.cosine)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                      <span>-1 反向</span>
                      <span>0 正交</span>
                      <span>1 同向</span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <dt className="text-xs text-zinc-500">欧氏距离</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {result.euclidean.toFixed(6)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <dt className="text-xs text-zinc-500">点积 a·b</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {result.product.toFixed(6)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <dt className="text-xs text-zinc-500">‖A‖₂</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {result.normA.toFixed(6)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3">
                      <dt className="text-xs text-zinc-500">‖B‖₂</dt>
                      <dd className="mt-1 font-mono font-semibold tabular-nums">
                        {result.normB.toFixed(6)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">L2 归一化证明</h2>
                  <p className="mb-3 text-xs leading-5 text-zinc-500">
                    归一化后：cosineSimilarity(a,b) === dot(normalize(a), normalize(b))
                  </p>
                  <dl className="flex flex-col gap-2 font-mono text-xs sm:text-sm">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <dt className="shrink-0 text-zinc-500">normalize(A)</dt>
                      <dd className="break-all">{formatVec(result.na)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <dt className="shrink-0 text-zinc-500">normalize(B)</dt>
                      <dd className="break-all">{formatVec(result.nb)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <dt className="shrink-0 text-zinc-500">dot(na, nb)</dt>
                      <dd className="tabular-nums">{result.normalizedDot.toFixed(12)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <dt className="shrink-0 text-zinc-500">|cosine − dot|</dt>
                      <dd
                        className={`tabular-nums font-semibold ${
                          result.proofDiff <= 1e-9 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {result.proofDiff.toExponential(3)}
                        {result.proofDiff <= 1e-9 ? " ✓ ≤ 1e-9" : " ✗ > 1e-9"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {is2d && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-3 text-base font-semibold">2D 平面（取前两维）</h2>
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                      <VectorPlane a={result.a} b={result.b} />
                      <div className="text-xs leading-5 text-zinc-500">
                        <p>
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-600" /> 蓝色 = A{" "}
                          {formatVec(result.a.slice(0, 2), 3)}
                        </p>
                        <p className="mt-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-600" /> 红色 = B{" "}
                          {formatVec(result.b.slice(0, 2), 3)}
                        </p>
                        <p className="mt-3">
                          夹角越小，余弦越接近 1；垂直时为 0；反向为 -1。
                        </p>
                        {result.a.length > 2 && (
                          <p className="mt-2 text-amber-600">
                            维度 &gt; 2：平面仅展示前两维，指标仍按全维计算。
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
