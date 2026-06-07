"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { ComponentRenderer } from "./ComponentRenderer";
import type { AIUIResponse, UIAction, UIResponse } from "./types";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  message: string;
  components: UIResponse[];
}

export function AIChatContainer() {
  const [sessionId] = useState("ui-web-demo");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || loading) {
      return;
    }

    const userTurn: ChatTurn = {
      id: createId("user"),
      role: "user",
      message: trimmedInput,
      components: [],
    };

    setMessages((current) => [...current, userTurn]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/ui-chat/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          input: trimmedInput,
          history: messages.map((message) => message.message),
        }),
      });

      const data = await readUIResponse(response);
      appendAssistantTurn(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: UIAction) {
    if (loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/ui-chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });

      const data = await readUIResponse(response);
      if (shouldReplaceLatestAssistantTurn(action)) {
        replaceLatestAssistantTurn(data);
      } else {
        appendAssistantTurn(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  function appendAssistantTurn(data: AIUIResponse) {
    setMessages((current) => [...current, createAssistantTurn(data)]);
  }

  function replaceLatestAssistantTurn(data: AIUIResponse) {
    setMessages((current) => {
      const replacement = createAssistantTurn(data);
      const latestAssistantIndex = current.findLastIndex((turn) => turn.role === "assistant");

      if (latestAssistantIndex === -1) {
        return [...current, replacement];
      }

      const next = [...current];
      next[latestAssistantIndex] = replacement;
      return next;
    });
  }

  return (
    <section className="flex min-h-[640px] flex-col rounded-lg border border-zinc-200 bg-zinc-100/70 shadow-sm">
      <header className="border-b border-zinc-200 bg-white px-5 py-4">
        <h2 className="text-lg font-semibold text-zinc-950">AI UI 交互</h2>
        <p className="mt-1 text-sm text-zinc-600">Session: {sessionId}</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm leading-6 text-zinc-600">
            输入“你好”查看常用服务，或输入“我要提一个新需求”开始需求分析。
          </div>
        ) : null}

        {messages.map((turn) => (
          <article className={turn.role === "user" ? "ml-auto max-w-[82%]" : "mr-auto max-w-full"} key={turn.id}>
            <div className={turn.role === "user" ? "rounded-lg bg-zinc-950 px-4 py-3 text-sm leading-6 text-white" : "space-y-3"}>
              {turn.role === "assistant" ? <p className="text-sm font-medium text-zinc-700">{turn.message}</p> : turn.message}
              {turn.components.map((component) => (
                <ComponentRenderer component={component} key={component.id} onAction={handleAction} />
              ))}
            </div>
          </article>
        ))}

        {loading ? <div className="mr-auto w-fit rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">处理中...</div> : null}
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      </div>

      <form className="flex gap-2 border-t border-zinc-200 bg-white p-4" onSubmit={handleSubmit}>
        <input
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
          onChange={(event) => setInput(event.target.value)}
          placeholder="输入消息"
          value={input}
        />
        <button
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading || !input.trim()}
          type="submit"
        >
          发送
        </button>
      </form>
    </section>
  );
}

function shouldReplaceLatestAssistantTurn(action: UIAction) {
  const payload = action.payload ?? action.value;

  return payload === "view_report" || payload === "back_to_result" || payload === "edit_detail";
}

function createAssistantTurn(data: AIUIResponse): ChatTurn {
  return {
    id: createId("assistant"),
    role: "assistant",
    message: data.message,
    components: data.components,
  };
}

async function readUIResponse(response: Response): Promise<AIUIResponse> {
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  return (await response.json()) as AIUIResponse;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
