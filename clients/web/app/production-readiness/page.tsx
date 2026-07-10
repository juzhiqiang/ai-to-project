"use client";

import Link from "next/link";

const CAPABILITY_SECTIONS = [
  {
    title: "错误降级",
    status: "ready",
    items: [
      "expert agentNode try-catch",
      "[expert 专家暂不可用] 降级输出",
      "aggregator 标记生产降级",
    ],
  },
  {
    title: "PostgresSaver",
    status: "optional",
    items: [
      "DATABASE_URL 驱动配置",
      "checkpointer.setup() 初始化表",
      "thread_id: user-{userId}:session-{sessionId}",
    ],
  },
  {
    title: "UI 协议",
    status: "ready",
    items: [
      "human-in-the-loop-confirmation",
      "activeExperts 动态 steps",
      "functional_expert / security_expert 状态",
    ],
  },
  {
    title: "成本硬上限",
    status: "locked",
    items: ["maxSteps = 6", "maxRevises = 2", "retryCount <= 1", "activeExperts <= 4"],
  },
] as const;

const TEST_SCENARIOS = [
  {
    name: "模拟专家失败",
    command: "FakeBoundToolModel.invoke -> throw new Error('model overloaded')",
    expected: "aggregator 报告中出现“生产降级”和“建议人工补充”。",
  },
  {
    name: "验证 HITL 中断",
    command: "toUIResponse(result, { interrupted: true })",
    expected: "components 包含 confirmation，id 为 human-in-the-loop-confirmation。",
  },
  {
    name: "验证 checkpoint 配置",
    command: "configurePostgresSaver({ databaseUrl, loadPostgresSaver })",
    expected: "返回 saver，并调用 setup()。",
  },
] as const;

export default function ProductionReadinessPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_50%,#f4f4f5_100%)] px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Production Readiness
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Multi-Agent 生产化工程能力
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600 text-pretty">
              汇总专家降级、持久化、HITL UI 协议和成本硬上限，方便上线前逐项核对。
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CAPABILITY_SECTIONS.map((section) => (
            <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={section.title}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-950">{section.title}</h2>
                <span className={statusClassName(section.status)}>{section.status}</span>
              </div>
              <ul className="mt-4 flex flex-col gap-2">
                {section.items.map((item) => (
                  <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-5 text-zinc-700" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)]">
          <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Runtime Contract</p>
            <div className="mt-5 grid gap-3">
              <ContractRow label="专家失败" value="降级输出写入对应 expert outputField" />
              <ContractRow label="持久化" value="PostgresSaver 与会话 PostgreSQL 共用 DATABASE_URL" />
              <ContractRow label="人工介入" value="interrupted -> confirmation 组件" />
              <ContractRow label="预算" value="maxSteps = 6, maxRevises = 2, retryCount <= 1" />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-950">测试剧本</h2>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
                {TEST_SCENARIOS.length} checks
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {TEST_SCENARIOS.map((scenario, index) => (
                <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4" key={scenario.name}>
                  <p className="text-sm font-semibold text-zinc-950">
                    {index + 1}. {scenario.name}
                  </p>
                  <code className="mt-3 block overflow-auto rounded-md bg-white px-3 py-2 text-xs leading-5 text-zinc-700">
                    {scenario.command}
                  </code>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{scenario.expected}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-100">{value}</p>
    </div>
  );
}

function statusClassName(status: string) {
  if (status === "ready") {
    return "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700";
  }

  if (status === "locked") {
    return "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700";
  }

  return "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700";
}
