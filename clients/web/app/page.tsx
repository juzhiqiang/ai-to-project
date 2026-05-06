"use client";

import type { RequirementResult } from "@repo/contracts";
import { useState } from "react";

const DEFAULT_INPUT = "用户注册时必须绑定手机号，密码至少8位";

export default function Home() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<RequirementResult | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const displayResult = error ? { error } : result;

  async function extractRequirement() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/requirement/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as RequirementResult;
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
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header>
          <h1 className="text-2xl font-semibold sm:text-3xl">需求结构化抽取</h1>
        </header>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-zinc-700" htmlFor="requirement-input">
            需求文本
          </label>
          <textarea
            id="requirement-input"
            className="min-h-36 resize-y rounded border border-zinc-300 bg-white p-3 text-base leading-7 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            className="w-fit rounded bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || !input.trim()}
            onClick={extractRequirement}
            type="button"
          >
            {loading ? "提交中..." : "提交"}
          </button>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-700">JSON 结果</h2>
          <pre className="min-h-52 overflow-auto rounded border border-zinc-300 bg-white p-4 text-sm leading-6 text-zinc-900">
            {JSON.stringify(displayResult, null, 2)}
          </pre>
        </section>
      </section>
    </main>
  );
}
