在 services/api 的 LangChain 层中，把提示内容抽成模板，并提供最小模板渲染与调用示例，严格按以下要求执行：

1. 提示模板：
   - 新建 services/api/src/llm/prompts/requirement.prompt.ts
   - 导出 REQUIREMENT_SYSTEM_PROMPT
   - 导出 REQUIREMENT_USER_TEMPLATE（包含 {input} 占位符）

2. 模板构建器：
   - 新建 services/api/src/llm/requirement.prompt-builder.ts
   - 用 ChatPromptTemplate.fromMessages() 组装 system + human 消息

3. 示例路由：
   - POST prompt-preview：只渲染模板，不调模型
   - POST prompt-to-model：模板 → formatMessages → 模型调用

测试输入统一为：'用户注册时必须绑定手机号，密码至少8位'
