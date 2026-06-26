# Requirement Analysis Routing Design

**Date:** 2026-06-25

## Goal

在现有 `services/api/src/llm/graph/requirement-analysis-graph.ts` 的五段式分析链前增加意图路由层，让请求根据意图走 `analyze`、`query`、`chat` 三条路径，而不是所有请求都执行完整分析链，同时保持 `runAnalysisGraph()` 作为统一入口并兼容旧输出接口。

## Current Context

- 现有实现已经把需求分析迁移到 LangGraph。
- `OrchestratorService` 通过 `runAnalysisGraph()` 执行分析，不在外层做分支。
- 现有图只支持完整分析链：`extract -> clarify -> analysis_step -> risk_step -> summary_step`。
- 现有测试覆盖了五段式图顺序、状态写入以及旧入口委托 graph。

## Requirements

### Functional

1. 扩展 graph state，增加：
   - `intent: 'analyze' | 'query' | 'chat'`
   - `reasoning: string | null`
   - `queryResponse: string | null`
   - `chatResponse: string | null`
2. 增加 `classifier` 节点：
   - 主路径使用 `ChatModel.withStructuredOutput(zod schema)`
   - schema 至少包含 `intent` 与 `reasoning`
   - system prompt 明确三类意图规则、特征、示例、边界情况、优先级
   - 出错时降级到规则判断，确保不会卡住
3. 增加 `queryHandler`、`chatHandler` 节点：
   - 分别调用模型生成查询回复与闲聊回复
   - 同步写入 `summary`，保持旧 `report` 字段可用
4. 图结构改为：
   - `START -> classifier`
   - classifier 条件分支到 `extract` / `queryHandler` / `chatHandler`
   - `queryHandler -> END`
   - `chatHandler -> END`
   - `extract -> clarify -> analysis_step -> risk_step -> summary_step -> END`
5. 扩展 `runAnalysisGraph()` 输出类型：
   - 返回 `intent`
   - 可选返回 `queryResponse`、`chatResponse`
   - `steps` 根据实际路径动态记录
6. 增加测试覆盖 7 个意图场景，验证分流、结果字段、节点触发和降级行为。

### Non-Functional

- query/chat 路径必须比完整分析链更短，且不触发业务分析节点。
- 分类失败时仍要返回稳定结果，默认可继续走 `analyze`。
- 不引入第二套入口逻辑，graph 仍然是唯一编排中心。

## Chosen Approach

采用“单图内前置 classifier 节点”的方式实现路由。

### Why

- 与 6.3 的 StateGraph 迁移保持一致，避免把流程重新拆回 service 层 `if/else`。
- 只保留一个公开入口 `runAnalysisGraph()`，最小化对调用方影响。
- query/chat/analyze 三种路径都能通过 graph introspection 和测试直接验证。

### Rejected Alternatives

- 在 `OrchestratorService` 里手写路由：
  - 优点：实现快
  - 缺点：破坏“由 graph 统一编排”的目标
- 新建一层 router graph 再嵌套调用分析 graph：
  - 优点：职责更分离
  - 缺点：对当前任务过重，增加调试与测试复杂度

## Design

### 1. State and Runtime

`RequirementAnalysisState` 新增：

- `intent`，默认 `analyze`
- `reasoning`
- `queryResponse`
- `chatResponse`

runtime 上下文新增基础聊天模型引用，供 `classifier`、`queryHandler`、`chatHandler` 共用。这样不需要把 query/chat 伪装成已有业务 agent，也不需要修改五段式 agent 构建方式。

### 2. Classifier Node

`classifierNode` 负责只做一件事：给当前输入判定意图并写入 state。

主流程：

1. 使用 `z.object({ intent: z.enum(['analyze', 'query', 'chat']), reasoning: z.string() })`
2. 调用 `model.withStructuredOutput(schema).invoke(...)`
3. 返回 `{ intent, reasoning }`

降级流程：

- 若 structured output 抛错、返回无效、或模型不可用，则转为规则判断：
  - 命中需求编号正则且包含 `查询`、`状态`、`进度`、`报告`、`结果` 等，判为 `query`
  - 纯问候、寒暄、开放式闲聊判为 `chat`
  - 其余默认 `analyze`
- 降级也要填写 `reasoning`，标明来自 fallback 规则

优先级规则：

1. 明确查询词 + 需求编号时优先 `query`
2. 纯闲聊优先 `chat`
3. 没有明确查询/闲聊特征时默认 `analyze`
4. 像“查询 XXX 的分析报告”这类边界情况仍判为 `query`

### 3. Route Mapping

增加 `routeByIntent(state)`，将 state intent 映射为 graph node id：

- `analyze -> extract`
- `query -> query_handler`
- `chat -> chat_handler`

这层映射保留意图语义与 graph 节点 id 的解耦，避免把业务术语和 LangGraph 内部命名绑定死。

### 4. Query and Chat Handlers

两个处理节点都直接调用共享 chat model：

- `queryHandlerNode`
  - system prompt: “你是需求查询助手”
  - 输入为用户原始请求
  - 返回 `{ queryResponse, summary }`
- `chatHandlerNode`
  - system prompt: “你是友好的AI助手”
  - 输入为用户原始请求
  - 返回 `{ chatResponse, summary }`

两者都会向 `steps` 写入对应步骤记录，便于测试验证未触发完整分析链。

### 5. Result Mapping

`buildResult()` 扩展为根据 state 组装：

- 所有路径都返回 `intent`
- query 路径返回 `queryResponse`
- chat 路径返回 `chatResponse`
- `report` 继续读取 `summary`
- analyze 路径维持现有 `completed / clarification / fallback` 语义
- query/chat 路径统一视为 `completed`

### 6. Testing

保持 Jest `*.spec.ts` 惯例，在 graph 测试目录新增或扩展 spec。

测试目标：

1. 完整分析请求走 analyze 路径，并填满分析状态
2. 带编号查询走 query 路径，不写入分析字段
3. 闲聊走 chat 路径，不触发业务节点
4. 模糊意图不会卡住，能稳定落到 analyze 或 query
5. 编号优先级生效
6. 简短需求默认 analyze
7. “查询风险分析报告”这类边界输入优先 query

为保证测试稳定：

- 用可脚本化 mock model 和 scripted agents
- 对 structured output 与 fallback 两条路径都做至少一例验证
- 节点触发通过 `steps` 和 mock 调用次数共同断言

## Files In Scope

- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts`
- Modify: `services/api/src/llm/agents/orchestrator.service.ts`
- Modify: `services/api/src/llm/model.factory.ts` only if current typing blocks `withStructuredOutput`
- Modify/Create: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`

## Risks and Mitigations

- `ChatModelLike` 目前类型较窄，可能未声明 `withStructuredOutput`
  - 处理：优先局部扩展 graph 内部所需模型接口；只有必要时才调整共享类型
- query/chat 直接使用模型会让测试不好 mock
  - 处理：通过 runtime 注入单个 model mock，避免依赖真实网络
- LangGraph 条件边命名与 state channel 命名存在限制
  - 处理：继续使用显式 graph node 常量，与业务 state 字段分离

## Success Criteria

- 7 个指定场景中至少 6 个断言命中预期 intent
- analyze/query/chat 三类请求走不同路径
- query/chat 路径不触发完整分析链节点
- `runAnalysisGraph()` 仍然是统一入口，旧调用方无需改动
- 相关 Jest 测试和 `bun run typecheck` 通过
