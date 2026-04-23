"use client";

import { APP_NAME } from "@repo/contracts";
import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function callApi() {
    setLoading(true);
    try {
      const res = await fetch("/api/hello");
      const data = (await res.json()) as { message: string };
      setResult(data.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold">Hello from {APP_NAME}</h1>
      <button
        className="mt-6 rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        disabled={loading}
        onClick={callApi}
      >
        {loading ? "Loading..." : "Call API"}
      </button>
      {result ? <p className="mt-4 text-lg">{result}</p> : null}
    </main>
  );
}
