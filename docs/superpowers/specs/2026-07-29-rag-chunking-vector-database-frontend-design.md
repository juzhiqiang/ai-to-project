# RAG 切分与向量数据库测试界面设计

## 目标

完成任务 9.2 和 9.3，并为两项能力提供浏览器可操作的测试页面和可重复运行的前端自动化测试。9.2 保留已经完成的纯函数切分模块；9.3 新增独立的 pgvector 仓储层和 HNSW 索引脚本。

## 范围

- 完成普通切分与 Parent-Child 切分的 API、页面和代理路由。
- 实现向量记录 upsert、数据库维度校验和余弦相似度检索。
- 提供基于查询文本的数据库检索 API，避免用户手工输入 384 维向量。
- 新增独立的文档切分页 `/rag-chunking` 和向量数据库页 `/vector-database`。
- 补充后端 11.5 测试，以及两个前端页面的入口、控件、代理和错误处理测试。
- 不修改既有 `src/document/chunk.service.ts` 和 `src/document/search.service.ts` 的行为。

## 架构

### 纯函数与仓储层

`services/api/rag/chunking/` 继续作为 9.2 的纯函数模块。NestJS 控制器只负责参数校验和响应映射，通过相对路径调用该模块。

`services/api/rag/retrieval/vector-store.ts` 作为 9.3 的仓储边界。它只依赖一个具有 `$queryRaw` 能力的 Prisma 形状，不依赖 pgvector 客户端。模块导出 `VectorStoreRecord`、`SearchResult`、`upsertChunks` 和 `similaritySearch`。

`upsertChunks` 校验每条 embedding 非空且维度一致，然后使用带冲突更新的参数化 SQL 写入 `DocumentChunk`。`similaritySearch` 先读取一条非空 embedding 的 `vector_dims`，将其与查询向量长度比较；不一致时抛出 `RangeError`。通过余弦距离运算符 `<=>` 排序，并把结果映射为 `score = 1 - distance`。

### 后端 API

RAG 控制器提供两个端点：

- `POST /api/rag/chunk`：接收文本、模式、块大小和重叠大小，返回普通或 Parent-Child 切分结果。
- `POST /api/rag/search`：接收查询文本、`topK` 和可选 `modelName`。控制器使用现有 embedding 服务生成查询向量，再调用 `similaritySearch`。

请求字段无效时返回明确的 4xx 错误。数据库未配置、无向量记录或数据库查询失败时保留可识别的错误信息，由前端代理映射为稳定响应。检索接口不暴露浏览器 upsert 操作，避免测试页面意外写入业务数据；`upsertChunks` 由后端自动化测试覆盖。

### 索引脚本

`services/api/scripts/create-hnsw-index.sql` 显式启用 `vector` 扩展，并在 `DocumentChunk.embedding` 上创建使用 `vector_cosine_ops` 的 HNSW 索引。参数为 `m=16`、`ef_construction=64`。脚本注释注明先完成全量向量入库，再由运维人工批准执行索引创建。

## 前端体验

首页增加两个入口：`文档切分测试` 和 `向量数据库测试`。

`/rag-chunking` 使用分段控件选择普通切分或 Parent-Child，提供块大小、重叠大小和文本输入。结果区稳定展示块数量、偏移量和 Parent-Child 关系；加载、空结果和错误状态不会改变主要布局。

`/vector-database` 提供查询文本、`topK` 和可选模型名。提交后展示命中块的文档标识、块序号、模型、分数和内容。未配置数据库、无数据及维度异常使用页面内错误状态呈现。页面只执行检索，不提供数据写入按钮。

两个页面分别通过 Next.js Route Handler 代理后端，统一使用 `API_ORIGIN`，透传正常状态码，并在后端不可达时返回 502 JSON。

## 测试策略

开发遵循 Red-Green-Refactor：先写测试并确认因缺少实现而失败，再添加最小实现。

后端 `chapter11-rag.spec.ts` 增加 11.5 用例：

- 50 条确定性 mock 向量上，KNN baseline 与模拟 ANN 返回相同的前 K 条结果。
- 校验余弦结果满足 `score = 1 - distance`。
- 校验查询向量与数据库向量维度不一致时抛出 `RangeError`。
- 校验 upsert 的参数化 SQL、记录维度一致性和空向量拒绝行为。

前端测试沿用当前 `node:test` 约定，检查首页入口、页面核心控件、请求路径、代理路由和 502 错误处理。完成后运行 API 指定测试、Web 测试、两个工作区的类型检查和构建。

## 完成标准

- 9.2、9.3 任务文档列出的输出文件和行为全部存在。
- 两个测试页面可以通过首页进入，并能调用各自 API。
- 相关后端和前端测试通过，API 与 Web 类型检查通过，生产构建通过。
- 不引入新的 NLP 或 pgvector 客户端依赖，不覆盖工作区中用户已有的无关改动。
