import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./app/page.tsx", import.meta.url), "utf8");
const analysisGraphPagePath = new URL("./app/analysis-graph/page.tsx", import.meta.url);
const triagePagePath = new URL("./app/triage/page.tsx", import.meta.url);
const planExecutePagePath = new URL("./app/plan-execute/page.tsx", import.meta.url);
const productionReadinessPagePath = new URL("./app/production-readiness/page.tsx", import.meta.url);
const tokenEstimatorPagePath = new URL("./app/token-estimator/page.tsx", import.meta.url);
const agentsOrchestrateRoutePath = new URL("./app/api/agents/orchestrate/route.ts", import.meta.url);
const agentsPlanExecuteRoutePath = new URL("./app/api/agents/plan-execute/route.ts", import.meta.url);
const tokenEstimatorRoutePath = new URL("./app/api/cost/token-estimate/route.ts", import.meta.url);
const criticRefinePageSource = readFileSync(new URL("./app/critic-refine/page.tsx", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");

test("requirement page calls the backend route path directly", () => {
  assert.match(pageSource, /fetch\("\/requirement\/extract"/);
  assert.doesNotMatch(pageSource, /fetch\("\/api\/requirement\/extract"/);
});

test("home page links to the supervisor playground", () => {
  assert.match(pageSource, /href="\/analysis-graph"/);
  assert.match(pageSource, /Supervisor 多专家测试/);
});

test("home page links to the triage handoff playground", () => {
  assert.match(pageSource, /href="\/triage"/);
  assert.match(pageSource, /Triage Handoff/);
});

test("home page links to the plan execute pipeline playground", () => {
  assert.match(pageSource, /href="\/plan-execute"/);
  assert.match(pageSource, /Plan Execute/);
});

test("home page links to the production readiness dashboard", () => {
  assert.match(pageSource, /href="\/production-readiness"/);
  assert.match(pageSource, /Production Readiness/);
});

test("home page links to the token cost estimator", () => {
  assert.match(pageSource, /href="\/token-estimator"/);
  assert.match(pageSource, /Token Cost Estimator/);
});

test("home page links to the vector similarity playground", () => {
  assert.match(pageSource, /href="\/vector-similarity"/);
  assert.match(pageSource, /向量相似度/);
});

test("vector similarity page renders interactive similarity controls", () => {
  const vectorSimilarityPagePath = new URL("./app/vector-similarity/page.tsx", import.meta.url);
  assert.equal(existsSync(vectorSimilarityPagePath), true);

  const pageSrc = readFileSync(vectorSimilarityPagePath, "utf8");

  assert.match(pageSrc, /向量相似度可视化测试/);
  assert.match(pageSrc, /cosineSimilarity/);
  assert.match(pageSrc, /euclideanDistance/);
  assert.match(pageSrc, /归一化后 cosine = dot/);
  assert.match(pageSrc, /向量维度不匹配/);
  assert.match(pageSrc, /id="vector-a"/);
  assert.match(pageSrc, /id="vector-b"/);
});

test("critic refine route reuses the graph playground implementation", () => {
  assert.match(criticRefinePageSource, /analysis-graph\/page/);
});

test("next rewrites the requirement route to the API service", () => {
  assert.match(nextConfigSource, /source:\s*"\/requirement\/:path\*"/);
  assert.match(nextConfigSource, /destination:.*\/requirement\/:path\*/s);
});

test("next preserves the API prefix when proxying API routes", () => {
  assert.match(nextConfigSource, /source:\s*"\/api\/:path\*"/);
  assert.match(nextConfigSource, /destination:.*\/api\/:path\*/s);
});

test("analysis graph page calls the orchestrator API route", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /fetch\("\/api\/agents\/orchestrate"/);
});

test("web owns an explicit orchestrator proxy route with readable backend errors", () => {
  assert.equal(existsSync(agentsOrchestrateRoutePath), true);

  const routeSource = readFileSync(agentsOrchestrateRoutePath, "utf8");

  assert.match(routeSource, /API_ORIGIN/);
  assert.match(routeSource, /http:\/\/127\.0\.0\.1:3001/);
  assert.match(routeSource, /Backend orchestrator request failed/);
  assert.match(routeSource, /status:\s*502/);
});

test("web owns an explicit plan execute proxy route with readable backend errors", () => {
  assert.equal(existsSync(agentsPlanExecuteRoutePath), true);

  const routeSource = readFileSync(agentsPlanExecuteRoutePath, "utf8");

  assert.match(routeSource, /API_ORIGIN/);
  assert.match(routeSource, /\/api\/agents\/plan-execute/);
  assert.match(routeSource, /Backend plan execute request failed/);
  assert.match(routeSource, /status:\s*502/);
});

test("web owns an explicit token estimator proxy route with readable backend errors", () => {
  assert.equal(existsSync(tokenEstimatorRoutePath), true);

  const routeSource = readFileSync(tokenEstimatorRoutePath, "utf8");

  assert.match(routeSource, /API_ORIGIN/);
  assert.match(routeSource, /\/api\/cost\/token-estimate/);
  assert.match(routeSource, /Backend token estimator request failed/);
  assert.match(routeSource, /status:\s*502/);
});

test("analysis graph page renders an execution trace section", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /执行轨迹/);
  assert.match(analysisPageSource, /未触发工具链/);
});

test("analysis graph page prefers the backend graph trace", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /graphTrace/);
  assert.match(analysisPageSource, /Graph Trace/);
  assert.match(analysisPageSource, /Supervisor/);
  assert.match(analysisPageSource, /功能专家/);
});

test("analysis graph page surfaces backend fallback errors", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /errorMessage/);
  assert.match(analysisPageSource, /后端执行失败/);
});

test("analysis graph page surfaces critic refine details", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /Supervisor Playground/);
  assert.match(analysisPageSource, /Critic-Refine/);
  assert.match(analysisPageSource, /reviseCount/);
  assert.match(analysisPageSource, /critiqueIssues/);
  assert.match(analysisPageSource, /summary\.refine/);
});

test("analysis graph page surfaces supervisor expert details", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /activeExperts/);
  assert.match(analysisPageSource, /supervisorReasoning/);
  assert.match(analysisPageSource, /functionalAnalysis/);
  assert.match(analysisPageSource, /performanceAnalysis/);
  assert.match(analysisPageSource, /securityAnalysis/);
  assert.match(analysisPageSource, /complianceAnalysis/);
});

test("analysis graph page can schedule the multi-agent test script cases", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /MULTI_AGENT_TEST_CASES/);
  assert.match(analysisPageSource, /单专家场景：简单文案修改/);
  assert.match(analysisPageSource, /四专家全开：复杂的金融场景/);
  assert.match(analysisPageSource, /runMultiAgentCases/);
  assert.match(analysisPageSource, /expectedExperts/);
  assert.match(analysisPageSource, /elapsedMs/);
});

test("triage page calls the orchestrator API route and renders handoff fields", () => {
  assert.equal(existsSync(triagePagePath), true);

  const triagePageSource = readFileSync(triagePagePath, "utf8");

  assert.match(triagePageSource, /fetch\("\/api\/agents\/orchestrate"/);
  assert.match(triagePageSource, /handoffReason/);
  assert.match(triagePageSource, /risk_only/);
  assert.match(triagePageSource, /Triage Handoff/);
});

test("plan execute page calls the pipeline API route and renders reflexion fields", () => {
  assert.equal(existsSync(planExecutePagePath), true);

  const planExecutePageSource = readFileSync(planExecutePagePath, "utf8");

  assert.match(planExecutePageSource, /fetch\("\/api\/agents\/plan-execute"/);
  assert.match(planExecutePageSource, /Plan Execute/);
  assert.match(planExecutePageSource, /reflections/);
  assert.match(planExecutePageSource, /retryCount/);
  assert.match(planExecutePageSource, /stepResults/);
});

test("production readiness page renders degradation, saver, ui protocol, and budget controls", () => {
  assert.equal(existsSync(productionReadinessPagePath), true);

  const pageSource = readFileSync(productionReadinessPagePath, "utf8");

  assert.match(pageSource, /Production Readiness/);
  assert.match(pageSource, /PostgresSaver/);
  assert.match(pageSource, /human-in-the-loop-confirmation/);
  assert.match(pageSource, /functional_expert/);
  assert.match(pageSource, /maxSteps = 6/);
  assert.match(pageSource, /maxRevises = 2/);
  assert.match(pageSource, /retryCount <= 1/);
});

test("token estimator page renders interactive testing controls", () => {
  assert.equal(existsSync(tokenEstimatorPagePath), true);

  const pageSource = readFileSync(tokenEstimatorPagePath, "utf8");

  assert.match(pageSource, /Token Cost Estimator/);
  assert.match(pageSource, /fetch\("\/api\/cost\/token-estimate"/);
  assert.match(pageSource, /toolSchemas/);
  assert.match(pageSource, /estimatedCostUsd/);
  assert.match(pageSource, /真实调用/);
  assert.match(pageSource, /后端模型/);
  assert.match(pageSource, /以上价格示例自 2025-2026/);
  assert.doesNotMatch(pageSource, /id="model-name"/);
})
;
;

const agentModelSetFilePath = "D:\\myProject\\ai-to-Project\\services\\api\\src\\llm\\cost\\agent-model-set.ts";
// 8.3 节：按角色默认 + 运行时覆盖的模型分级
test("agent-model-set.ts exports required types and functions", () => {
  const source = readFileSync(agentModelSetFilePath, "utf8");

  // 类型导出
  assert.match(source, /export type AgentName/);
  assert.match(source, /export interface AgentModelSet/);

  // 常量导出
  assert.match(source, /export const HIGH_RISK_AGENTS/);
  assert.match(source, /export const DEFAULT_AGENT_MODEL_SET/);
  assert.match(source, /export const AGENT_TO_CONFIG_KEY/);

  // 函数导出
  assert.match(source, /export function resolveModelForAgent/);
});

test("HIGH_RISK_AGENTS contains 5 high-risk roles", () => {
  const source = readFileSync(agentModelSetFilePath, "utf8");

  // HIGH_RISK_AGENTS 包含 5 个高风险角色
  assert.match(source, /'supervisor'/);
  assert.match(source, /'security_expert'/);
  assert.match(source, /'compliance_expert'/);
  assert.match(source, /'summary_agent'/);
  assert.match(source, /'critic'/);
});

test("resolveModelForAgent follows decision order: budget >=100, budget 80-100, low complexity, default", () => {
  const source = readFileSync(agentModelSetFilePath, "utf8");

  // 决策顺序必须严格：budget >= 100 -> budget 80-100 -> low complexity -> default
  const budgetRejectIdx = source.indexOf('budget_exceeded_reject');
  const budgetTightIdx = source.indexOf('budget_tight_downgrade');
  const lowComplexityIdx = source.indexOf('low_complexity_downgrade');

  assert.strictEqual(budgetRejectIdx > 0, true);
  assert.strictEqual(budgetTightIdx > budgetRejectIdx, true);
  assert.strictEqual(lowComplexityIdx > budgetTightIdx, true);
});

test("DEFAULT_AGENT_MODEL_SET assigns correct modelConfigId per role", () => {
  const source = readFileSync(agentModelSetFilePath, "utf8");

  // 高风险角色使用 demo-gpt-4o
  assert.match(source, /supervisorModelConfigId.*demo-gpt-4o/);
  assert.match(source, /securityModelConfigId.*demo-gpt-4o/);
  assert.match(source, /complianceModelConfigId.*demo-gpt-4o/);
  assert.match(source, /summaryModelConfigId.*demo-gpt-4o/);
  assert.match(source, /criticModelConfigId.*demo-gpt-4o/);

  // functional/performance/risk 使用 demo-gpt-4o-mini
  assert.match(source, /functionalModelConfigId.*demo-gpt-4o-mini/);
  assert.match(source, /performanceModelConfigId.*demo-gpt-4o-mini/);
  assert.match(source, /riskModelConfigId.*demo-gpt-4o-mini/);

  // compressor 使用 demo-deepseek-chat
  assert.match(source, /compressorModelConfigId.*demo-deepseek-chat/);
});

test("agent-model-set has no import of PrismaClient or ChatOpenAI", () => {
  const source = readFileSync(agentModelSetFilePath, "utf8");

  assert.doesNotMatch(source, /import.*PrismaClient/);
  assert.doesNotMatch(source, /import.*ChatOpenAI/);
  assert.doesNotMatch(source, /from.*@prisma/);
});

// 8.5 节：预算阈值 + 自动降级 + 拒绝的运行时策略
test("budget-policy.ts exports required types and functions", () => {
  const budgetPolicyPath = "D:\\myProject\\ai-to-Project\\services\\api\\src\\llm\\cost\\budget-policy.ts";
  const source = readFileSync(budgetPolicyPath, "utf8");

  // 类型导出
  assert.match(source, /export type BudgetAction/);
  assert.match(source, /export interface BudgetPolicyInput/);
  assert.match(source, /export interface BudgetPolicyResult/);

  // 函数导出
  assert.match(source, /export function resolveBudgetAction/);
});

test("HIGH_RISK_AGENTS is imported from agent-model-set.ts", () => {
  const budgetPolicyPath = "D:\\myProject\\ai-to-Project\\services\\api\\src\\llm\\cost\\budget-policy.ts";
  const source = readFileSync(budgetPolicyPath, "utf8");

  // HIGH_RISK_AGENTS should be imported, not duplicated
  assert.match(source, /import.*HIGH_RISK_AGENTS.*from.*agent-model-set/);
});

test("resolveBudgetAction follows decision order: <80 allow, 80-100 downgrade/allow by risk, >=100 reject/allow compressor", () => {
  const budgetPolicyPath = "D:\\myProject\\ai-to-Project\\services\\api\\src\\llm\\cost\\budget-policy.ts";
  const source = readFileSync(budgetPolicyPath, "utf8");

  // 决策顺序检查
  const allowIdx = source.indexOf("action: 'allow'");
  const downgradeIdx = source.indexOf("action: 'downgrade'");
  const rejectIdx = source.indexOf("action: 'reject'");

  assert.strictEqual(allowIdx > 0, true);
  assert.strictEqual(downgradeIdx > allowIdx, true);
  assert.strictEqual(rejectIdx > downgradeIdx, true);
});

test("budget-policy.ts has no import of PrismaClient or external DB", () => {
  const budgetPolicyPath = "D:\\myProject\\ai-to-Project\\services\\api\\src\\llm\\cost\\budget-policy.ts";
  const source = readFileSync(budgetPolicyPath, "utf8");

  assert.doesNotMatch(source, /import.*PrismaClient/);
  assert.doesNotMatch(source, /import.*@prisma/);
});
