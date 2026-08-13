# RAG Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure retrieval metrics, an optional resilient RAGAS REST client, an API evaluation endpoint, and a browser test page backed by the evaluation fixture.

**Architecture:** The API owns evaluation orchestration. Pure metric functions are isolated under `services/api/rag/evaluation`; the controller validates JSON, loads the fixture, aggregates metrics, and optionally calls the injected RAGAS runner. The Next.js page talks only to a same-origin proxy route and lets users edit samples and retrieved IDs without requiring a live RAGAS service.

**Tech Stack:** NestJS, TypeScript, Jest, Next.js 16, React 19, Tailwind utility classes, native `fetch`/`AbortController`.

---

### Task 1: Add the evaluation fixture and pure retrieval metrics

**Files:**
- Create: `services/api/test/fixtures/rag-eval-set.json`
- Create: `services/api/rag/evaluation/retrieval-metrics.ts`
- Modify: `services/api/test/chapter11-rag.spec.ts`

- [ ] **Step 1: Add a deterministic fixture with the required fields**

```json
[
  {
    "question": "退款政策是什么？",
    "expectedDocIds": ["doc-refund"],
    "groundTruth": "签收后 7 天内且商品完好可申请退货。"
  },
  {
    "question": "如何联系人工客服？",
    "expectedDocIds": ["doc-support", "doc-contact"],
    "groundTruth": "可通过订单页联系人工客服。"
  }
]
```

- [ ] **Step 2: Write failing tests for the three metric contracts**

```ts
describe("11.7 评估", () => {
  it("11.7.1 Recall@K = 1 when every relevant ID is in Top-K", () => {
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 3)).toBe(1);
  });
  it("11.7.1 MRR is 1 for rank 1 and 0.5 for rank 2", () => {
    expect(mrr([["a"], ["x", "b"]], [["a"], ["b"]])).toBe(0.75);
  });
  it("11.7.1 NDCG@K is 1 for a complete single hit", () => {
    expect(ndcgAtK(["doc-refund"], ["doc-refund"], 1)).toBe(1);
  });
  it("returns zero for empty relevant IDs and invalid K", () => {
    expect(recallAtK(["a"], [], 5)).toBe(0);
    expect(ndcgAtK(["a"], [], 5)).toBe(0);
    expect(recallAtK(["a"], ["a"], 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm it fails because the module is missing**

Run: `bun --cwd services/api test -- chapter11-rag.spec.ts`

Expected: FAIL with an import/module error for `../rag/evaluation/retrieval-metrics`.

- [ ] **Step 4: Implement the pure functions**

Use set membership for binary relevance, slice retrieved results to `k`, return `0` for empty relevant sets, and compute ideal DCG from `min(k, relevantIds.length)`.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run: `bun --cwd services/api test -- chapter11-rag.spec.ts`

Expected: PASS, including the existing 11.2–11.5 tests.

### Task 2: Add the resilient RAGAS REST runner

**Files:**
- Create: `services/api/rag/evaluation/ragas-runner.ts`
- Modify: `services/api/test/chapter11-rag.spec.ts`

- [ ] **Step 1: Write mock-fetch tests before implementation**

Cover a successful `POST /evaluate`, a retry after a thrown fetch error, and three failures returning `null` while calling `warn`. Inject `fetch`, `sleep`, and logger so no real network call is made.

- [ ] **Step 2: Run the focused tests and verify the runner tests fail**

Run: `bun --cwd services/api test -- chapter11-rag.spec.ts`

Expected: FAIL because `runRagasEvaluation` is not exported.

- [ ] **Step 3: Implement `runRagasEvaluation`**

Define `RagasSample`, `RagasRunInput`, and `RagasRunnerDeps`; POST `{ samples, metrics }` to `${baseUrl}/evaluate`; use a 60,000 ms `AbortController`; retry at most three attempts; accept only an object whose values are finite numbers; log a warning and return `null` for all failure paths.

- [ ] **Step 4: Run the runner tests**

Run: `bun --cwd services/api test -- chapter11-rag.spec.ts`

Expected: PASS with no outbound network access.

### Task 3: Expose evaluation through NestJS and fixture endpoints

**Files:**
- Create: `services/api/src/llm/rag/evaluation.controller.ts`
- Modify: `services/api/src/app.module.ts`
- Create: `services/api/test/evaluation.controller.spec.ts`

- [ ] **Step 1: Write controller tests for validation and aggregation**

Mock the runner and call the controller with two samples and retrieved IDs. Assert `recallAtK`, `mrr`, and `ndcgAtK` are returned, RAGAS values are included on success, and `ragas: null` plus a warning status is returned when the runner degrades. Assert `GET /api/rag/evaluation/fixture` returns the JSON fixture.

- [ ] **Step 2: Run the controller test and verify it fails**

Run: `bun --cwd services/api test -- evaluation.controller.spec.ts`

Expected: FAIL because the controller is not registered.

- [ ] **Step 3: Implement `POST /api/rag/evaluation` and `GET /api/rag/evaluation/fixture`**

Validate non-empty samples, integer `k` in 1–100, string IDs, and optional RAGAS metrics. Resolve the fixture from `process.cwd()/test/fixtures/rag-eval-set.json`, compute per-query and aggregate metrics, then call the runner only when RAGAS samples and metrics are present. Register the controller in `AppModule`.

- [ ] **Step 4: Run controller and API tests**

Run: `bun --cwd services/api test -- evaluation.controller.spec.ts chapter11-rag.spec.ts`

Expected: PASS.

### Task 4: Add the Next.js proxy and evaluation test page

**Files:**
- Create: `clients/web/app/api/rag/evaluation/route.ts`
- Create: `clients/web/app/rag-evaluation/page.tsx`
- Modify: `clients/web/app/page.tsx`

- [ ] **Step 1: Add the same-origin proxy**

Forward `GET` and `POST` to `${API_ORIGIN}/api/rag/evaluation`, preserve status and JSON content type, and return a 502 JSON error when the API is unreachable.

- [ ] **Step 2: Build the page states and interactions**

Load the fixture on demand, render editable sample rows with question, expected IDs, retrieved IDs, ground truth, answer, and contexts, send the edited payload to the proxy, and render metric cards, per-query rows, loading, empty, and error states. Keep the existing zinc/black/white workbench style and use accessible labels and 44px controls.

- [ ] **Step 3: Add the homepage link**

Add a `/rag-evaluation` link next to the existing vector and chunking test links.

- [ ] **Step 4: Run web checks**

Run: `bun --cwd clients/web typecheck` and `bun --cwd clients/web build`.

Expected: PASS with the `/rag-evaluation` route included in the build.

### Task 5: Full verification and handoff

**Files:**
- Modify only files already listed above if verification exposes a defect.

- [ ] **Step 1: Run the complete API test suite**

Run: `bun --cwd services/api test`

Expected: PASS with no real RAGAS dependency.

- [ ] **Step 2: Run repository typecheck/build checks**

Run: `bun run typecheck` and `bun run build`.

Expected: PASS for API and web packages.

- [ ] **Step 3: Manually verify the page against the running dev servers**

Open `http://localhost:3000/rag-evaluation`, load the fixture, enter retrieved IDs, run evaluation, and confirm the metric cards and RAGAS degradation message render.
