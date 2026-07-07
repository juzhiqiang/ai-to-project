import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./app/page.tsx", import.meta.url), "utf8");
const analysisGraphPagePath = new URL("./app/analysis-graph/page.tsx", import.meta.url);
const nextConfigSource = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");

test("requirement page calls the backend route path directly", () => {
  assert.match(pageSource, /fetch\("\/requirement\/extract"/);
  assert.doesNotMatch(pageSource, /fetch\("\/api\/requirement\/extract"/);
});

test("home page links to the analysis graph playground", () => {
  assert.match(pageSource, /href="\/analysis-graph"/);
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

test("analysis graph page renders an execution trace section", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /执行轨迹/);
  assert.match(analysisPageSource, /未触发工具链/);
});

test("analysis graph page prefers the backend graph trace", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /graphTrace/);
  assert.match(analysisPageSource, /Graph Trace/);
  assert.match(analysisPageSource, /ReAct agent/);
});

test("analysis graph page surfaces backend fallback errors", () => {
  const analysisPageSource = readFileSync(analysisGraphPagePath, "utf8");

  assert.match(analysisPageSource, /errorMessage/);
  assert.match(analysisPageSource, /后端执行失败/);
});
