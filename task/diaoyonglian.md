在 services/api 的 LangChain 层中，用 pipe() 构建最小调用链，严格按以下要求执行：

1. 调用链：
   - 新建 services/api/src/llm/requirement.chain.ts
   - 用 requirementPrompt.pipe(model).pipe(new StringOutputParser()) 构建链
   - 导出 requirementChain

2. 新增以下路由：
   - POST chain-invoke
   - POST chain-stream
   - POST chain-batch

输入统一为：'用户注册时必须绑定手机号，密码至少8位'
