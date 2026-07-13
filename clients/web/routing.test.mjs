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
});
