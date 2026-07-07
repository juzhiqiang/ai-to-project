# React Analysis Subgraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old analysis step with a ReAct analysis subgraph, add mock tools and loop protection, and expose a standalone web test page for manual verification.

**Architecture:** Keep the existing routed requirement analysis graph as the entrypoint, extract the new analysis logic into a dedicated LangGraph subgraph, and have the parent graph consume the subgraph result through shared state. Add a small standalone Next page that calls the existing orchestrator endpoint and surfaces the graph output for debugging.

**Tech Stack:** TypeScript, NestJS, Next.js App Router, `@langchain/langgraph` 1.2.9, `@langchain/core`, Zod, Jest, Node test runner, Bun.

---

### Task 1: Lock API behavior with failing graph tests

**Files:**
- Modify: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`
- Test: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`

- [ ] **Step 1: Write the failing test for plain requirements finishing without tools**

```ts
it('generates analysis directly for plain input without a requirement id', async () => {
  const graph = createAnalysisSubGraph();
  const model = createBoundToolModel([
    aiText([
      '功能分解：提供个人资料编辑。',
      '用户故事：作为用户，我希望修改昵称。',
      '验收标准：提交后昵称更新成功。',
      '技术复杂度评估：低。',
    ].join('\n')),
  ]);

  const state = await graph.invoke(
    {
      messages: [new HumanMessage('新增个人资料编辑功能')],
      toolLoopCount: 0,
      analysisResult: null,
    },
    {
      context: {
        requirementAnalysis: createAnalysisRuntime({ analysisModel: model }),
      },
    },
  );

  expect(state.analysisResult).toContain('功能分解');
  expect(state.toolLoopCount).toBe(0);
});
```

- [ ] **Step 2: Run the focused spec and verify RED**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts`

Expected: FAIL because `createAnalysisSubGraph` and the subgraph runtime helpers do not exist yet.

- [ ] **Step 3: Write the failing test for REQ inputs that must call `search_requirement` first**

```ts
it('looks up requirement details before final analysis when input contains a req id', async () => {
  const searchRequirement = jest.fn().mockResolvedValue('REQ-100 detail');
  const graph = createAnalysisSubGraph();
  const model = createBoundToolModel([
    aiToolCall('search_requirement', { reqId: 'REQ-100' }),
    aiText([
      '功能分解：扩展已存在需求。',
      '用户故事：作为产品经理，我希望查看已有需求上下文。',
      '验收标准：分析基于查询到的详情输出。',
      '技术复杂度评估：中。',
    ].join('\n')),
  ]);

  const state = await graph.invoke(
    {
      messages: [new HumanMessage('分析 REQ-100 并补充方案')],
      toolLoopCount: 0,
      analysisResult: null,
    },
    {
      context: {
        requirementAnalysis: createAnalysisRuntime({
          analysisModel: model,
          tools: createAnalysisTools({ searchRequirement }),
        }),
      },
    },
  );

  expect(searchRequirement).toHaveBeenCalledWith('REQ-100');
  expect(state.toolLoopCount).toBe(1);
  expect(state.analysisResult).toContain('验收标准');
});
```

- [ ] **Step 4: Run the focused spec and verify RED**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts`

Expected: FAIL because tools and tool-loop behavior do not exist yet.

### Task 2: Add subgraph-specific edge-case tests before implementation

**Files:**
- Modify: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`
- Test: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`

- [ ] **Step 1: Write the failing test for login/auth requests triggering conflict checks**

```ts
it('can trigger conflict detection for login and authentication requirements', async () => {
  const checkConflicts = jest.fn().mockResolvedValue({ hasConflict: true, reasons: ['SSO already exists'] });
  const graph = createAnalysisSubGraph();
  const model = createBoundToolModel([
    aiToolCall('check_conflicts', { reqId: 'REQ-200', description: '新增登录与单点登录能力' }),
    aiText([
      '功能分解：账号密码登录、单点登录。',
      '用户故事：作为用户，我希望安全登录。',
      '验收标准：发现认证方案冲突并给出建议。',
      '技术复杂度评估：中高。',
    ].join('\n')),
  ]);

  const state = await graph.invoke(
    {
      messages: [new HumanMessage('分析 REQ-200，新增登录与单点登录能力')],
      toolLoopCount: 0,
      analysisResult: null,
    },
    {
      context: {
        requirementAnalysis: createAnalysisRuntime({
          analysisModel: model,
          tools: createAnalysisTools({ checkConflicts }),
        }),
      },
    },
  );

  expect(checkConflicts).toHaveBeenCalled();
  expect(state.analysisResult).toContain('技术复杂度评估');
});
```

- [ ] **Step 2: Write the failing test for forced exit at six tool loops**

```ts
it('forces finalize after six tool loops to prevent infinite cycles', async () => {
  const graph = createAnalysisSubGraph();
  const model = createBoundToolModel([
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
    aiToolCall('search_requirement', { reqId: 'REQ-300' }),
  ]);

  const state = await graph.invoke(
    {
      messages: [new HumanMessage('分析 REQ-300')],
      toolLoopCount: 0,
      analysisResult: null,
    },
    {
      context: {
        requirementAnalysis: createAnalysisRuntime({ analysisModel: model }),
      },
    },
  );

  expect(state.toolLoopCount).toBe(6);
  expect(state.analysisResult).toContain('达到工具调用上限');
});
```

- [ ] **Step 3: Write the failing test for main-graph integration and trace logging**

```ts
it('writes analysisResult into the parent graph state and records the tool path', async () => {
  const trace: string[] = [];
  const result = await runAnalysisGraph({
    input: '分析 REQ-500，补充登录能力',
    policyContext: '无相关政策文档',
    agents: createScriptedAgents(),
    model: createParentGraphModelWithToolFlow(trace),
  });

  expect(result.report).toContain('功能分解');
  expect(trace.join(' -> ')).toContain('agent -> tools -> agent -> finalize');
});
```

- [ ] **Step 4: Run the focused spec and verify RED**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts`

Expected: FAIL because conflict tools, loop limits, and trace handling are not implemented.

### Task 3: Implement the analysis tools and subgraph

**Files:**
- Create: `services/api/src/llm/graph/analysis-tools.ts`
- Create: `services/api/src/llm/graph/analysis-subgraph.ts`
- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts`

- [ ] **Step 1: Add the analysis tool factory and mock implementations**

```ts
export function createAnalysisTools(overrides: Partial<AnalysisToolOverrides> = {}) {
  const searchRequirement = overrides.searchRequirement ?? defaultSearchRequirement;
  const checkConflicts = overrides.checkConflicts ?? defaultCheckConflicts;

  return [
    tool(async ({ reqId }) => searchRequirement(reqId), {
      name: 'search_requirement',
      schema: z.object({ reqId: z.string() }),
    }),
    tool(async ({ reqId, description }) => checkConflicts(reqId, description), {
      name: 'check_conflicts',
      schema: z.object({ reqId: z.string(), description: z.string() }),
    }),
  ];
}
```

- [ ] **Step 2: Add the subgraph with `agent`, `tools`, and `finalize` nodes**

```ts
export function createAnalysisSubGraph() {
  return new StateGraph(AnalysisSubgraphState, RequirementAnalysisContext)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent, ['tools', 'finalize'])
    .addEdge('tools', 'agent')
    .addEdge('finalize', END)
    .compile();
}
```

- [ ] **Step 3: Replace the old analysis step in the parent graph with the subgraph**

```ts
const analysisSubGraph = createAnalysisSubGraph();

async function analysisNode(
  state: RequirementAnalysisStateValue,
  runtimeConfig: RequirementAnalysisNodeRuntime,
): Promise<RequirementAnalysisStateUpdate> {
  if (hasClarificationQuestions(state)) {
    return { analysis: null, analysisResult: null };
  }

  const runtime = getRuntime(runtimeConfig);
  const nextState = await analysisSubGraph.invoke(state, { context: runtimeConfig.context });

  return {
    messages: nextState.messages,
    toolLoopCount: nextState.toolLoopCount,
    analysisResult: nextState.analysisResult,
    analysis: nextState.analysisResult,
  };
}
```

- [ ] **Step 4: Run the graph spec and verify GREEN**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts`

Expected: PASS for the new subgraph tests and existing route tests.

### Task 4: Adapt downstream nodes and result mapping

**Files:**
- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts`
- Test: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`

- [ ] **Step 1: Update `riskNode`, `summaryNode`, and `buildResult()` to use `analysisResult` safely**

```ts
const analysisText = ensureText(
  state.analysisResult ?? state.analysis,
  'analysis subgraph output is required before risk review',
);
```

- [ ] **Step 2: Keep old outward compatibility while preserving the new state**

```ts
return {
  ...base,
  mode: 'completed',
  clarificationQuestions: [],
  usedAgents: steps.map((step) => step.agent),
  fallback: null,
  steps,
  report: state.summary ?? state.analysisResult ?? '',
};
```

- [ ] **Step 3: Run tests and typecheck**

Run:
```bash
cd services/api
bun test test/llm/graph/requirement-analysis-graph.spec.ts
bun run typecheck
```

Expected: all graph tests pass and `tsc --noEmit` succeeds.

### Task 5: Add the standalone web test page with a failing UI test first

**Files:**
- Create: `clients/web/app/analysis-graph/page.tsx`
- Modify: `clients/web/routing.test.mjs`

- [ ] **Step 1: Write the failing test for the new page fetch target**

```js
test("analysis graph page calls the orchestrator API route", () => {
  const analysisPageSource = readFileSync(new URL("./app/analysis-graph/page.tsx", import.meta.url), "utf8");
  assert.match(analysisPageSource, /fetch\("\/api\/agents\/orchestrate"/);
});
```

- [ ] **Step 2: Run the web test and verify RED**

Run: `cd clients/web; node --test routing.test.mjs`

Expected: FAIL because the page file does not exist yet.

- [ ] **Step 3: Implement the standalone page**

```tsx
export default function AnalysisGraphPage() {
  const [input, setInput] = useState(DEFAULT_CASES[0].input);
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  async function runGraph() {
    const response = await fetch("/api/agents/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    setResult((await response.json()) as OrchestratorResult);
  }

  return <main>{/* preset cases, textarea, submit button, result panes */}</main>;
}
```

- [ ] **Step 4: Run the web test and verify GREEN**

Run: `cd clients/web; node --test routing.test.mjs`

Expected: PASS and confirm the page targets the proxied orchestrator endpoint.

### Task 6: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run the API verification suite**

Run:
```bash
cd services/api
bun test test/llm/graph/requirement-analysis-graph.spec.ts
bun run typecheck
```

Expected: PASS with no type errors.

- [ ] **Step 2: Run the web verification suite**

Run:
```bash
cd clients/web
node --test routing.test.mjs
bun run typecheck
```

Expected: PASS with no type errors.

- [ ] **Step 3: Review changed files before handoff**

Run:
```bash
git diff -- services/api/src/llm/graph/requirement-analysis-graph.ts services/api/src/llm/graph/analysis-subgraph.ts services/api/src/llm/graph/analysis-tools.ts services/api/test/llm/graph/requirement-analysis-graph.spec.ts clients/web/app/analysis-graph/page.tsx clients/web/routing.test.mjs
```

Expected: diff shows only the intended ReAct subgraph, tests, and standalone web test page.
