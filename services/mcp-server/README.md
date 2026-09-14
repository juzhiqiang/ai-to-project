# @repo/mcp-server — 需求分析 MCP Server

基于 `@modelcontextprotocol/sdk` 的 stdio MCP Server，提供三个需求分析 tool（全部实现在 `src/index.ts`）：

| Tool | 输入 | 逻辑 | 输出 |
| --- | --- | --- | --- |
| `estimate_complexity` | `requirementText`, `techStack?` | 正则匹配复杂因子（集成/权限/实时/AI/安全/数据/性能/流程），加权计分 | `size(S/M/L/XL)`, `estimatedDays`, `complexityScore`, `factors[]` |
| `check_conflicts` | `newRequirement`, `existingRequirements[{id,title,description}]` | 英文分词 + 中文二元组提取关键词，计算重叠度，重叠 ≥ 3 个关键词标记冲突 | `hasConflicts`, `conflictCount`, `conflicts[]`, `suggestion` |
| `generate_user_stories` | `requirementText`, `maxStories?(默认3)` | 正则提取角色（“作为XX”）与动作（“能够XX/可以XX/希望XX”等），生成 User Story | `stories[]`（`id`, `story`, `acceptanceCriteria[]`, `priority`） |

## 常用命令

```bash
bun run dev         # 开发模式（bun 直接跑 TS）
bun run build       # tsc 编译到 dist/
bun run start       # node dist/index.js
bun run typecheck   # 类型检查
```

## 用 MCP Inspector 调试

```bash
# 图形界面（浏览器）
npx @modelcontextprotocol/inspector bun src/index.ts

# 无头 CLI：列出工具
npx @modelcontextprotocol/inspector --cli bun src/index.ts --method tools/list

# 无头 CLI：调用工具
npx @modelcontextprotocol/inspector --cli bun src/index.ts --method tools/call \
  --tool-name estimate_complexity \
  --tool-arg requirementText="需要与第三方支付集成，支持实时推送"
```

## 在客户端中接入（stdio）

```json
{
  "mcpServers": {
    "requirement-analysis": {
      "command": "bun",
      "args": ["run", "dev"],
      "cwd": "services/mcp-server"
    }
  }
}
```
