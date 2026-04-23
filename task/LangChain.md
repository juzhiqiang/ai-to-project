在现有 monorepo 的 services/api 下，完成 LangChain 的接入准备与模型调用基础，严格按以下要求执行：

前置：
- 在 services/api 安装依赖：langchain @langchain/openai @langchain/core js-yaml
- 在 services/api/.env 中配置环境变量：OPENAI_API_KEY, OPENAI_BASE_URL, EMBEDDING_API_KEY, VECTOR_DB_URL, VECTOR_DB_API_KEY
- .env 加入 .gitignore

1. 配置层：
   - 新建 services/api/config/langchain.yaml，只放运行参数：llm、retrieval、tools、features
   - 新建 services/api/src/config/load-langchain-config.ts

2. 统一模型工厂：
   - 新建 services/api/src/llm/model.factory.ts
   - 从 YAML 读取模型参数，从 getApiKeys() 读取令牌和 baseURL

3. NestJS 骨架 + 三种调用路由：
   - 新建 services/api/src/llm/llm.module.ts
   - 新建 services/api/src/llm/llm.service.ts
   - 新建 services/api/src/llm/llm.controller.ts（@Controller('api/langchain')）
   - 在 LlmService + LlmController 中实现：POST invoke / POST stream / POST batch
   - 输入统一使用：'用户注册时必须绑定手机号，密码至少8位'

约束：
- 令牌/密钥/服务地址一律走 process.env
- 所有路由的 SystemMessage 角色为“需求结构化抽取助手”
- 不要在 Service 里直接 new ChatOpenAI，统一用 createChatModel()
- 所有能力以 Service 方法 + Controller 路由形式暴露
