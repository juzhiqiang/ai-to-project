# Requirement Analysis Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intent routing to the requirement analysis StateGraph so `analyze`, `query`, and `chat` requests follow different paths while preserving the existing analysis workflow and API compatibility.

**Architecture:** Keep the five-stage analyze chain intact, add a classifier node at the front, and route query/chat to dedicated handlers that write summary-compatible outputs. Pass a chat model into the graph runtime so classifier and handlers can use structured output and direct model invocations without introducing a second entrypoint.

**Tech Stack:** TypeScript, NestJS, `@langchain/langgraph` 1.2.9, `@langchain/openai`, Zod, Jest, Bun.

---

### Task 1: Lock the routing behavior with failing tests

**Files:**
- Modify: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`
- Modify: `services/api/test/llm/agents/orchestrator.service.spec.ts`

- [ ] **Step 1: Add a router-model test helper and red tests**

```ts
function createRouterModel(route: { intent: 'analyze' | 'query' | 'chat'; reasoning: string }, reply: string) {
  return {
    withStructuredOutput: jest.fn(() => ({
      invoke: jest.fn().mockResolvedValue(route),
    })),
    invoke: jest.fn(async (messages: Array<{ content: unknown }>) => {
      const prompt = messages.map((message) => String(message.content)).join('\n');
      if (prompt.includes('需求查询助手')) {
        return { content: reply };
      }
      if (prompt.includes('友好的AI助手')) {
        return { content: reply };
      }
      return { content: reply };
    }),
  } as any;
}

it('routes query inputs to the query handler without running the analyze chain', async () => {
  const agents = createScriptedAgents();
  const model = createRouterModel(
    { intent: 'query', reasoning: 'contains a request id and a status question' },
    '查询结果：REQ-20240315-001 当前状态为处理中。',
  );

  const result = await runAnalysisGraph({
    input: '查询 REQ-20240315-001 的当前状态',
    policyContext: '无相关政策文档',
    agents,
    model: model as any,
  });

  expect(result.intent).toBe('query');
  expect(result.queryResponse).toContain('处理中');
  expect(agents.extractAgent.invoke).not.toHaveBeenCalled();
  expect(agents.policyCheckAgent.invoke).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused spec and confirm it fails for the right reason**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts`

Expected: fail because `runAnalysisGraph()` does not yet accept or use `model`, and the result does not expose `intent` / `queryResponse`.

### Task 2: Implement the routing graph and runtime plumbing

**Files:**
- Modify: `services/api/src/llm/model.factory.ts`
- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts`
- Modify: `services/api/src/llm/agents/orchestrator.service.ts`

- [ ] **Step 1: Extend the model interface so the graph can use structured output**

```ts
export interface ChatModelLike {
  invoke(messages: BaseMessage[]): Promise<ModelResponseLike>;
  batch(messageBatches: BaseMessage[][]): Promise<ModelResponseLike[]>;
  stream(messages: BaseMessage[]): Promise<AsyncIterable<ModelResponseLike>> | AsyncIterable<ModelResponseLike>;
  withStructuredOutput<T>(schema: T): {
    invoke(messages: BaseMessage[]): Promise<T>;
  };
}
```

- [ ] **Step 2: Add classifier, query, and chat nodes plus conditional routing**

```ts
const intentSchema = z.object({
  intent: z.enum(['analyze', 'query', 'chat']),
  reasoning: z.string(),
});

return new StateGraph(RequirementAnalysisState, RequirementAnalysisContext)
  .addNode('classifier', classifierNode)
  .addNode('extract', extractNode)
  .addNode('clarify', clarifyNode)
  .addNode('analysis_step', analysisNode)
  .addNode('risk_step', riskNode)
  .addNode('summary_step', summaryNode)
  .addNode('queryHandler', queryHandlerNode)
  .addNode('chatHandler', chatHandlerNode)
  .addEdge(START, 'classifier')
  .addConditionalEdges('classifier', routeByIntent)
  .addEdge('extract', 'clarify')
  .addEdge('clarify', 'analysis_step')
  .addEdge('analysis_step', 'risk_step')
  .addEdge('risk_step', 'summary_step')
  .addEdge('summary_step', END)
  .addEdge('queryHandler', END)
  .addEdge('chatHandler', END)
  .compile();
```

- [ ] **Step 3: Pass the chat model into the graph from the orchestrator**

```ts
async orchestrate(request: string | OrchestratorInput): Promise<OrchestratorResult> {
  const { input, policyContext } = normalizeOrchestratorInput(request);

  return runAnalysisGraph({
    input,
    policyContext,
    agents: this.buildAgents(),
    model: this.createChatModel(),
  });
}
```

- [ ] **Step 4: Run the graph and orchestrator specs until green**

Run: `cd services/api; bun test test/llm/graph/requirement-analysis-graph.spec.ts test/llm/agents/orchestrator.service.spec.ts`

Expected: query/chat requests return `intent`, `queryResponse`, or `chatResponse`; analyze requests still return the existing final report and step chain.

### Task 3: Verify the full contract and clean up

**Files:**
- Modify: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`
- Modify: `services/api/test/llm/agents/orchestrator.service.spec.ts`
- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts` if any type or edge-name cleanup is needed after the first green run

- [ ] **Step 1: Tighten assertions for fallback and priority cases**

```ts
it('falls back to keyword routing when structured output throws', async () => {
  const agents = createScriptedAgents();
  const model = {
    withStructuredOutput: jest.fn(() => ({
      invoke: jest.fn().mockRejectedValue(new Error('structured output unavailable')),
    })),
    invoke: jest.fn(),
  } as any;

  const result = await runAnalysisGraph({
    input: '查询 REQ-20240415-002 的进度如何',
    policyContext: '无相关政策文档',
    agents,
    model,
  });

  expect(result.intent).toBe('query');
  expect(result.reasoning).toContain('fallback');
});
```

- [ ] **Step 2: Run the full verification suite**

Run:
```bash
cd services/api
bun test test/llm/graph/requirement-analysis-graph.spec.ts test/llm/agents/orchestrator.service.spec.ts
bun run typecheck
```

Expected: all tests pass and `tsc --noEmit` exits cleanly.

- [ ] **Step 3: Commit the routing changes**

```bash
git add services/api/src/llm/graph/requirement-analysis-graph.ts services/api/src/llm/agents/orchestrator.service.ts services/api/src/llm/model.factory.ts services/api/test/llm/graph/requirement-analysis-graph.spec.ts services/api/test/llm/agents/orchestrator.service.spec.ts
git commit -m "feat: add intent routing to requirement analysis graph"
```
