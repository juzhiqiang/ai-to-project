# RAG 评测指标与 RAGAS 集成设计

## 目标

增加一个不依赖外部服务的检索评测层，并通过可选的 RAGAS REST 服务评估生成质量；同时提供前端测试页，让开发者可以使用内置评测集或手动样本运行评测。

## 范围与数据流

评测集位于 `services/api/test/fixtures/rag-eval-set.json`，每条记录包含 `question`、`expectedDocIds` 和 `groundTruth`。前端将样本和对应的实际检索 ID 发送到 API。API 调用纯函数计算 Recall@K、MRR、NDCG@K；当请求包含 RAGAS 样本时，调用可配置的 `POST /evaluate` 服务。RAGAS 失败只产生警告并返回 `null`，不影响检索指标响应。

## 后端组件

`services/api/rag/evaluation/retrieval-metrics.ts` 只包含纯函数：

- `recallAtK(retrievedIds, relevantIds, k)` 返回 Top-K 中相关 ID 的比例；空相关集合返回 0。
- `mrr(rankedListsPerQuery, relevantPerQuery)` 对每条查询取第一个相关结果的倒数排名并求平均；没有命中时该查询贡献 0。
- `ndcgAtK(retrievedIds, relevantIds, k)` 使用二值相关性计算 DCG/理想 DCG；理想值为 0 时返回 0。

`services/api/rag/evaluation/ragas-runner.ts` 提供 `runRagasEvaluation`。默认从 `RAGAS_URL` 读取服务地址，使用 60 秒 AbortSignal timeout，失败最多重试 3 次。函数支持注入 `fetch`、logger 和 sleep，便于单元测试；HTTP 非 2xx、响应不是数字映射、网络错误和超时均返回 `null` 并调用 `warn`。

`POST /api/rag/evaluation` 接受评测样本、实际检索 ID、`k`、检索指标开关和 RAGAS 配置，返回总指标、逐查询结果及 RAGAS 状态。接口不直接依赖真实 RAGAS 服务。

## 前端组件

新增 `/rag-evaluation` 页面，包含：内置评测集加载、样本编辑、Top-K 输入、运行按钮、总指标卡片、逐查询命中明细、RAGAS 地址和指标输入。RAGAS 不可用时展示降级提示。首页增加该页面入口，页面沿用现有工作台的黑白灰视觉系统并覆盖加载、错误和空状态。

## 测试与验收

- 在 `services/api/test/chapter11-rag.spec.ts` 中增加 Recall@K、MRR、NDCG@K 的边界和目标值测试。
- 增加 RAGAS runner 的 mock fetch 测试，验证请求格式、重试、超时失败降级和警告。
- 增加 evaluation controller 的请求校验及聚合响应测试。
- 运行 API Jest、API typecheck、Web typecheck/build，确认页面可加载且不依赖真实 RAGAS 服务。
