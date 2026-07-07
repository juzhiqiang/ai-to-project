# React Analysis Subgraph Design

**Date:** 2026-07-07

## Goal

在现有 `services/api/src/llm/graph/requirement-analysis-graph.ts` 的 6.4 路由版主图基础上，将原本的 `analysisStep` 升级为一个可独立运行的 ReAct 子图，并提供一个独立的 web 测试页面用于联调和手工验证。

## Current Context

- 当前主图已经具备 `classifier -> extract -> clarify -> analysis_step -> risk_step -> summary_step` 的编排能力。
- `runAnalysisGraph()` 仍然是统一入口，并由 `OrchestratorService` 通过 `POST /api/agents/orchestrate` 对外提供服务。
- web 端当前只有首页 [clients/web/app/page.tsx](D:/myProject/ai-to-Project/clients/web/app/page.tsx) 的需求抽取调试台，没有针对分析图的独立测试入口。
- 当前 graph 测试主要覆盖 6.4 的意图路由，不覆盖 ReAct 工具循环、工具上限和子图独立运行。

## Requirements

### Functional

1. 用 `createAnalysisSubGraph()` 替换主图中的原 `analysisStep`。
2. State 增加：
   - `analysisResult: string | null`
   - `toolLoopCount: number`，默认 `0`
3. 子图节点必须包含：
   - `agentNode`
   - `toolsNode`
   - `finalizeNode`
4. 子图图结构必须为：
   - `START -> agent`
   - `agent --(有 tool_calls)--> tools`
   - `tools -> agent`
   - `agent --(无 tool_calls 或达到上限)--> finalize`
   - `finalize -> END`
5. `agentNode` 必须：
   - 使用 `createChatModel().bindTools(analysisTools)` 产物或等价的运行时注入模型绑定工具
   - 通过 system prompt 约束“REQ 编号先查详情、需要时查冲突、信息足够后直接输出结论、避免重复工具调用”
   - 输出至少包含：功能分解、用户故事、验收标准、技术复杂度评估
6. `toolsNode` 必须直接使用 `@langchain/langgraph/prebuilt` 的 `ToolNode`。
7. `finalizeNode` 必须从最后一条 AI 回复提取分析文本并写入 `analysisResult`，空内容时要安全降级。
8. 提供两个分析工具：
   - `search_requirement(reqId)`
   - `check_conflicts(reqId, description)`
9. 若没有真实后端能力，工具允许先使用 mock 数据与规则实现。
10. 新增独立 web 页面用于调用 `/api/agents/orchestrate`，可直接测试普通需求、REQ 编号需求、登录认证冲突需求。

### Non-Functional

- 工具循环必须稳定，不能出现无限回边。
- 达到 6 次工具轮次后必须强制结束并落盘结果。
- 子图应可独立编译和运行，便于单元测试。
- 服务端需要留下节点路径日志，便于观察 `agent -> tools -> agent -> finalize`。
- 主图旧入口和 query/chat 路由行为不能被破坏。

## Chosen Approach

采用“主图保留、analysis 节点替换为子图节点”的增量升级方式。

### Why

- 最贴近 6.5 的“在 8.4 基础上增量升级”要求。
- 不需要重写 `risk` 与 `summary` 逻辑，能保住 6.4 已经稳定的路由行为。
- 子图可以独立导出和测试，同时主图仍然保持单一入口。

### Rejected Alternatives

- 把 `risk` 和 `summary` 也折叠进 ReAct 子图：
  - 优点：流程更统一
  - 缺点：改动范围过大，容易和 6.4 的验收目标互相影响
- 在 `OrchestratorService` 层手写工具循环：
  - 优点：实现直白
  - 缺点：违背“让 graph 负责编排”的现有方向

## Design

### 1. State and Runtime

主图 state 在保留现有字段的基础上新增：

- `analysisResult`
- `toolLoopCount`

`messages` 继续沿用 `MessagesAnnotation`，作为子图中的 agent/tool 消息交换通道。

graph runtime 新增以下运行时资源：

- `model`：基础 chat model
- `analysisModel`：已 `bindTools(analysisTools)` 的模型
- `analysisTools`：供 `ToolNode` 执行的工具数组
- `graphTrace`：记录节点路径的字符串数组，供日志与测试断言

### 2. Analysis Tools

工具先用 mock 实现，保持接口稳定：

- `search_requirement`
  - 输入：`reqId`
  - 输出：需求标题、描述、状态、依赖、备注
  - 数据源：本地常量映射表
- `check_conflicts`
  - 输入：`reqId`、`description`
  - 输出：`hasConflict`、`reasons`
  - 规则：登录、认证、密码、SSO、单点登录等关键词触发潜在冲突

工具定义放在独立文件中，避免继续膨胀主图文件。

### 3. Analysis Subgraph

`createAnalysisSubGraph()` 返回一个可编译子图，并导出供独立测试。

节点职责：

- `agentNode`
  - 读取当前 `messages`
  - 调用 `analysisModel.invoke(messages)`
  - 将新的 `AIMessage` 追加回 state
  - 记录 `graphTrace`
- `toolsNode`
  - 直接使用 `new ToolNode(analysisTools)`
  - 每次进入该节点时把 `toolLoopCount + 1`
  - 记录 `graphTrace`
- `finalizeNode`
  - 从最后一条 `AIMessage` 提取文本
  - 写入 `analysisResult`
  - 若文本为空，则写入安全降级文案
  - 记录 `graphTrace`

条件路由规则：

- 最后一条 `AIMessage` 含有 `tool_calls` 且 `toolLoopCount < 6`：进入 `tools`
- 否则：进入 `finalize`

### 4. Main Graph Integration

主图中的 `analysis_step` 节点不再直接调用旧 `policyCheckAgent`，改为调用子图。

集成方式：

- `clarify` 后若仍需补充信息，`analysisResult` 维持 `null`
- 若无需澄清，则执行子图并把 `analysisResult` 写回主图 state
- `riskNode` 和 `summaryNode` 从 `analysisResult` 读取分析文本，替代旧 `analysis` 字段的语义

兼容策略：

- 为减少连锁改动，可以短期保留 `analysis` 字段，并在子图完成后同步写入 `analysis`
- `buildResult()` 对外继续使用现有 `report`，同时保证 `analysisResult` 在内部 state 可见

### 5. Logging

服务端日志通过统一 helper 输出：

- 图开始执行时输出输入摘要
- 每个子图节点进入时输出节点名
- 子图结束时输出 `graphTrace.join(' -> ')`

这样可以同时满足人工排查和单测断言需要。

### 6. Web Test Page

新增独立页面：

- 路径：`/analysis-graph`
- 文件：`clients/web/app/analysis-graph/page.tsx`

页面内容：

- 3 个预置样例按钮
  - 普通需求分析
  - REQ 编号分析
  - 登录认证冲突分析
- 自由输入文本框
- 提交按钮，调用 `POST /api/agents/orchestrate`
- 结果区展示：
  - `intent`
  - `report`
  - `steps`
  - `clarificationQuestions`
  - 原始 JSON

页面只做测试与联调，不引入新的设计系统或复杂状态管理。

## Files In Scope

- Modify: `services/api/src/llm/graph/requirement-analysis-graph.ts`
- Create: `services/api/src/llm/graph/analysis-subgraph.ts`
- Create: `services/api/src/llm/graph/analysis-tools.ts`
- Modify: `services/api/src/llm/agents/orchestrator.service.ts`
- Modify: `services/api/test/llm/graph/requirement-analysis-graph.spec.ts`
- Create: `clients/web/app/analysis-graph/page.tsx`
- Modify: `clients/web/routing.test.mjs`
- Modify: `clients/web/app/page.tsx` only if adding a link entry is helpful

## Risks and Mitigations

- `bindTools` 类型可能未完整暴露
  - 处理：在 graph 内定义最小工具绑定接口，避免大范围改动 model factory 类型
- LangGraph 子图和主图 state 合并时字段可能冲突
  - 处理：显式维护子图需要的最小 state，并在 finalize 阶段统一回写
- mock 工具过于随意会让测试不稳定
  - 处理：工具返回固定结构，关键词规则写死，避免依赖模型自由发挥
- web 调试页若耦合首页逻辑容易互相影响
  - 处理：单独路由，独立状态，不复用首页抽取台状态

## Success Criteria

- 子图具备稳定回边循环，并能在 6 次工具轮次内安全退出。
- `analysisResult` 能正确写回主图 state，并被后续节点消费。
- 至少 4/5 指定测试场景通过，最好全部通过。
- `/analysis-graph` 页面可直接联调 API 并展示图执行结果。
