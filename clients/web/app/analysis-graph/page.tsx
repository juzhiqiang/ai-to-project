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
  analysisResult?: string | null;
  errorMessage?: string | null;
  intent?: "analyze" | "query" | "chat";
  reasoning?: string | null;
  queryResponse?: string | null;
  chatResponse?: string | null;
  critique?: string | null;
  critiqueIssues?: string[];
  reviseCount?: number;
  summaryDraft?: string | null;
  activeExperts?: string[];
  supervisorReasoning?: string | null;
  functionalAnalysis?: string | null;
  performanceAnalysis?: string | null;
  securityAnalysis?: string | null;
  complianceAnalysis?: string | null;
}

type TraceTone = "active" | "warn" | "idle";

interface TraceItem {
  title: string;
  description: string;
  tone: TraceTone;
}

type MultiAgentCaseStatus = "pending" | "running" | "success" | "error";

interface MultiAgentTestCase {
  name: string;
  input: string;
  expectedExperts: string[];
}

interface MultiAgentCaseRun extends MultiAgentTestCase {
  status: MultiAgentCaseStatus;
  elapsedMs?: number;
  result?: OrchestratorResult;
  error?: string;
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
  {
    label: "性能容量",
    input: "新增大促秒杀报名能力，预计 10 分钟内 5 万用户同时提交，需要给出容量与降级方案。",
  },
  {
    label: "售后合规",
    input: "订单 EC20240315001，用户昨天签收且未拆封，申请退货，需要判断政策、留痕和人工复核条件。",
  },
] as const;

const MULTI_AGENT_TEST_CASES: MultiAgentTestCase[] = [
  {
    name: "单专家场景：简单文案修改",
    input: '需求：将登录页的"登录"按钮文案改为"立即登录"',
    expectedExperts: ["functional"],
  },
  {
    name: "双专家场景：功能+性能",
    input: "需求 REQ-20240315-001：支持批量导入 Excel 用户数据，单次最多 10000 行",
    expectedExperts: ["functional", "performance"],
  },
  {
    name: "三专家场景：功能+性能+安全",
    input: "需求：新增用户敏感数据导出功能，支持导出用户手机号和身份证信息",
    expectedExperts: ["functional", "performance", "security"],
  },
  {
    name: "四专家全开：复杂的金融场景",
    input: "需求：开发跨境支付功能，支持欧盟和中国用户，涉及个人金融信息处理",
    expectedExperts: ["functional", "performance", "security", "compliance"],
  },
  {
    name: "边界场景：模糊需求",
    input: "需求：优化系统",
    expectedExperts: [],
  },
];

const TRACE_NODE_LABEL: Record<string, string> = {
  supervisor: "Supervisor",
  "functional.agent": "功能专家 Agent",
  "functional.tools": "功能专家工具",
  "functional.finalize": "功能专家收敛",
  functional: "功能专家完成",
  "performance.agent": "性能专家 Agent",
  "performance.tools": "性能专家工具",
  "performance.finalize": "性能专家收敛",
  performance: "性能专家完成",
  "security.agent": "安全专家 Agent",
  "security.tools": "安全专家工具",
  "security.finalize": "安全专家收敛",
  security: "安全专家完成",
  "compliance.agent": "合规专家 Agent",
  "compliance.tools": "合规专家工具",
  "compliance.finalize": "合规专家收敛",
  compliance: "合规专家完成",
  aggregator: "Aggregator",
  agent: "ReAct agent",
  "summary.actor": "Summary actor",
  "summary.critic": "Summary critic",
  "summary.refine": "Summary refine",
  tools: "工具节点",
  finalize: "结果收敛",
};

const TRACE_NODE_DESCRIPTION: Record<string, string> = {
  supervisor: "Supervisor 使用 structured output 选择本轮需要并行执行的专家。",
  "functional.agent": "功能专家分析功能拆解、用户故事、验收标准和依赖边界。",
  "functional.tools": "功能专家通过 ToolNode 查询需求或检查认证冲突。",
  "functional.finalize": "功能专家把最后一次 AI 输出写入 functionalAnalysis。",
  functional: "功能专家分支完成，父级只接收 functionalAnalysis。",
  "performance.agent": "性能专家分析延迟、吞吐、并发、容量、缓存和监控指标。",
  "performance.tools": "性能专家通过 ToolNode 查询已有需求上下文。",
  "performance.finalize": "性能专家把最后一次 AI 输出写入 performanceAnalysis。",
  performance: "性能专家分支完成，父级只接收 performanceAnalysis。",
  "security.agent": "安全专家分析认证、授权、越权、审计和敏感数据风险。",
  "security.tools": "安全专家通过 ToolNode 查询需求或检查认证冲突。",
  "security.finalize": "安全专家把最后一次 AI 输出写入 securityAnalysis。",
  security: "安全专家分支完成，父级只接收 securityAnalysis。",
  "compliance.agent": "合规专家分析政策条款、隐私合规、留痕和人工复核条件。",
  "compliance.tools": "合规专家通过 ToolNode 查询需求或检查冲突。",
  "compliance.finalize": "合规专家把最后一次 AI 输出写入 complianceAnalysis。",
  compliance: "合规专家分支完成，父级只接收 complianceAnalysis。",
  aggregator: "Aggregator 只汇总 activeExperts 中被选中的专家结论。",
  agent: "分析子图调用绑定工具的模型，判断是否需要继续检索或直接输出分析。",
  tools: "ToolNode 执行模型请求的工具调用，例如 search_requirement 或 check_conflicts。",
  finalize: "子图将最后一次 AI 输出收敛为 analysisResult，并交回父图继续风险与摘要节点。",
};

const EXPERT_OUTPUTS = [
  { name: "functional", label: "功能专家", field: "functionalAnalysis" },
  { name: "performance", label: "性能专家", field: "performanceAnalysis" },
  { name: "security", label: "安全专家", field: "securityAnalysis" },
  { name: "compliance", label: "合规专家", field: "complianceAnalysis" },
] as const;

export default function AnalysisGraphPage() {
  const [input, setInput] = useState<string>(DEFAULT_CASES[0].input);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [caseRuns, setCaseRuns] = useState<MultiAgentCaseRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const traceItems = buildTraceItems(result);

  async function runGraph() {
    setLoading(true);
    setError("");

    try {
      const data = await requestOrchestrator(input);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function runMultiAgentCases() {
    setBatchRunning(true);
    setError("");
    setCaseRuns(MULTI_AGENT_TEST_CASES.map((testCase) => ({ ...testCase, status: "pending" })));

    for (const testCase of MULTI_AGENT_TEST_CASES) {
      setCaseRuns((current) =>
        current.map((item) => (item.name === testCase.name ? { ...item, status: "running" } : item)),
      );

      const startTime = Date.now();

      try {
        const data = await requestOrchestrator(testCase.input);
        const elapsedMs = Date.now() - startTime;
        setResult(data);
        setCaseRuns((current) =>
          current.map((item) =>
            item.name === testCase.name
              ? {
                  ...item,
                  status: "success",
                  elapsedMs,
                  result: data,
                  error: undefined,
                }
              : item,
          ),
        );
      } catch (err) {
        const elapsedMs = Date.now() - startTime;
        const message = err instanceof Error ? err.message : "Request failed";
        setCaseRuns((current) =>
          current.map((item) =>
            item.name === testCase.name
              ? {
                  ...item,
                  status: "error",
                  elapsedMs,
                  error: message,
                }
              : item,
          ),
        );
      }
    }

    setBatchRunning(false);
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-zinc-500">
              Supervisor Playground
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Supervisor 多专家 analysis 测试台</h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              这个页面直接调用 <code>/api/agents/orchestrate</code>，重点验证 analysis 子图的 Supervisor
              structured output、专家并行分支、Aggregator 汇总和 Summary critic-refine 输出。
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
              <button
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={batchRunning}
                onClick={runMultiAgentCases}
                type="button"
              >
                {batchRunning ? "批量执行中..." : "运行全部测试用例"}
              </button>
              <p className="text-xs text-zinc-500">建议先试 REQ-500 和 REQ-200 两个样例。</p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <MultiAgentCaseCatalog
              cases={MULTI_AGENT_TEST_CASES}
              disabled={batchRunning}
              onSelect={(testCase) => setInput(testCase.input)}
            />
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
              <MetricCard label="Active Experts" value={formatActiveExperts(result?.activeExperts)} />
              <MetricCard label="Revise Count" value={result?.reviseCount?.toString() ?? "-"} />
              <MetricCard label="Fallback" value={result?.fallback ?? "-"} />
              <MetricCard
                label="真实 Graph Trace"
                value={result?.graphTrace?.length ? `${result.graphTrace.length} 个节点` : "暂无"}
              />
            </div>

            <ResultBlock title="分析结论" value={result?.report ?? "运行后会在这里展示最终报告。"} />
            <ResultBlock title="路由原因" value={result?.reasoning ?? "暂无"} />

            <SupervisorPanel result={result} />

            <CriticRefinePanel result={result} />

            <TracePanel items={traceItems} />

            <MultiAgentBatchPanel runs={caseRuns} running={batchRunning} />

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

async function requestOrchestrator(input: string) {
  const response = await fetch("/api/agents/orchestrate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });
  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, response.status));
  }

  return payload as OrchestratorResult;
}

function MultiAgentCaseCatalog({
  cases,
  disabled,
  onSelect,
}: {
  cases: MultiAgentTestCase[];
  disabled: boolean;
  onSelect: (testCase: MultiAgentTestCase) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">批量测试脚本</h2>
        <span className="text-xs text-zinc-500">{cases.length} cases</span>
      </div>
      <ol className="flex flex-col gap-2">
        {cases.map((testCase, index) => (
          <li className="rounded-lg border border-zinc-200 bg-white p-3" key={testCase.name}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-950">
                  {index + 1}. {testCase.name}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  期望专家：{formatExpectedExperts(testCase.expectedExperts)}
                </p>
              </div>
              <button
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                onClick={() => onSelect(testCase)}
                type="button"
              >
                填入
              </button>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{testCase.input}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MultiAgentBatchPanel({ runs, running }: { runs: MultiAgentCaseRun[]; running: boolean }) {
  if (!runs.length && !running) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">批量测试结果</h2>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
          运行全部测试用例后，这里会展示每个场景的期望专家、实际专家、耗时和专家输出摘要。
        </div>
      </div>
    );
  }

  const completedRuns = runs.filter((run) => run.status === "success" || run.status === "error");
  const matchedRuns = runs.filter((run) => run.result && expertSelectionMatches(run.expectedExperts, run.result.activeExperts ?? []));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">批量测试结果</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
          {completedRuns.length}/{runs.length} done, {matchedRuns.length} matched
        </span>
      </div>
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        {runs.map((run, index) => {
          const activeExperts = run.result?.activeExperts ?? [];
          const matched = run.result ? expertSelectionMatches(run.expectedExperts, activeExperts) : false;

          return (
            <article className="rounded-lg border border-zinc-200 bg-white p-3" key={run.name}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-950">
                    {index + 1}. {run.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{run.input}</p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassName(run.status)}`}>
                  {statusLabel(run.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs leading-5 text-zinc-600 sm:grid-cols-3">
                <p>期望：{formatExpectedExperts(run.expectedExperts)}</p>
                <p>实际：{formatActiveExperts(activeExperts)}</p>
                <p>耗时：{formatElapsed(run.elapsedMs)}</p>
              </div>

              {run.result ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500">匹配状态</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${matched ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {matched ? "matched" : "review"}
                    </span>
                    {activeExperts.length > 1 ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                        平均每专家 {formatAverageElapsed(run.elapsedMs, activeExperts.length)}
                      </span>
                    ) : null}
                  </div>

                  {activeExperts.length ? (
                    <div className="mt-3 grid gap-3">
                      {activeExperts.map((expert) => {
                        const output = getExpertOutput(run.result, expert);

                        return (
                          <details className="rounded-lg border border-zinc-200 bg-white p-3" key={`${run.name}-${expert}`}>
                            <summary className="cursor-pointer text-sm font-medium text-zinc-950">
                              {expert} 专家输出（{output.length} 字符）
                            </summary>
                            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                              {truncateText(output, 500) || "无输出"}
                            </p>
                          </details>
                        );
                      })}
                    </div>
                  ) : null}

                  <details className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-950">
                      汇总结果（{run.result.analysisResult?.length ?? 0} 字符）
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                      {truncateText(run.result.analysisResult ?? "", 700) || "无汇总结果"}
                    </p>
                  </details>
                </div>
              ) : null}

              {run.error ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{run.error}</div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SupervisorPanel({ result }: { result: OrchestratorResult | null }) {
  const activeExperts = result?.activeExperts ?? [];
  const supervisorReasoning = result?.supervisorReasoning?.trim() ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Supervisor 多专家</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
          {formatActiveExperts(activeExperts)}
        </span>
      </div>

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Supervisor Reasoning</p>
          <p className="mt-2 whitespace-pre-wrap break-words">{supervisorReasoning || "运行后显示专家选择理由"}</p>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {EXPERT_OUTPUTS.map((expert) => {
            const output = result?.[expert.field]?.trim() ?? "";
            const active = activeExperts.includes(expert.name);

            return (
              <article
                className={`rounded-lg border p-3 ${
                  active ? "border-zinc-300 bg-white" : "border-zinc-200 bg-zinc-100 text-zinc-500"
                }`}
                key={expert.name}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-950">{expert.label}</p>
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600">
                    {active ? "active" : "idle"}
                  </span>
                </div>
                <p className="mt-3 min-h-16 whitespace-pre-wrap break-words text-sm leading-6">
                  {output || (active ? "专家已选中，等待后端返回结论。" : "本轮未选中。")}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CriticRefinePanel({ result }: { result: OrchestratorResult | null }) {
  const critique = result?.critique?.trim() ?? "";
  const issues = result?.critiqueIssues ?? [];
  const status = !result ? "Waiting" : result.mode !== "completed" ? "Not completed" : critique ? "Needs refine" : "Passed";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Critic-Refine</h2>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
          {status}
        </span>
      </div>
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Revise Count</p>
            <p className="mt-2 font-medium text-zinc-950">{result?.reviseCount ?? "-"}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Critique</p>
            <p className="mt-2 whitespace-pre-wrap break-words">{critique || "No active critique"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Issues</p>
          {issues.length ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">No critic issues returned</p>
          )}
        </div>

        {result?.summaryDraft ? (
          <details className="rounded-lg border border-zinc-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Initial Summary Draft
            </summary>
            <p className="mt-3 whitespace-pre-wrap break-words">{result.summaryDraft}</p>
          </details>
        ) : null}
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

function formatActiveExperts(activeExperts: string[] | undefined) {
  return activeExperts?.length ? activeExperts.join(", ") : "暂无";
}

function formatExpectedExperts(expectedExperts: string[]) {
  return expectedExperts.length ? expectedExperts.join(", ") : "至少一个";
}

function expertSelectionMatches(expectedExperts: string[], activeExperts: string[]) {
  if (!expectedExperts.length) {
    return activeExperts.length > 0;
  }

  return (
    expectedExperts.length === activeExperts.length &&
    expectedExperts.every((expert) => activeExperts.includes(expert))
  );
}

function getExpertOutput(result: OrchestratorResult | undefined, expertName: string) {
  const field = EXPERT_OUTPUTS.find((expert) => expert.name === expertName)?.field;
  const output = field && result ? result[field] : "";

  return typeof output === "string" ? output : "";
}

function parseJsonResponse(responseText: string): unknown {
  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return { error: responseText };
  }
}

function errorMessageFromPayload(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = typeof record.detail === "string" ? record.detail : undefined;
    const error = typeof record.error === "string" ? record.error : undefined;
    const message = typeof record.message === "string" ? record.message : undefined;

    return detail ?? error ?? message ?? `Request failed with status ${status}`;
  }

  return `Request failed with status ${status}`;
}

function statusLabel(status: MultiAgentCaseStatus) {
  if (status === "running") {
    return "running";
  }

  if (status === "success") {
    return "success";
  }

  if (status === "error") {
    return "error";
  }

  return "pending";
}

function statusClassName(status: MultiAgentCaseStatus) {
  if (status === "running") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function formatElapsed(elapsedMs: number | undefined) {
  return typeof elapsedMs === "number" ? `${elapsedMs}ms` : "-";
}

function formatAverageElapsed(elapsedMs: number | undefined, expertCount: number) {
  if (typeof elapsedMs !== "number" || expertCount <= 0) {
    return "-";
  }

  return `${Math.round(elapsedMs / expertCount)}ms`;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
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
