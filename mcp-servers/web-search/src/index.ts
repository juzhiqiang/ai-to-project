/**
 * Web Search MCP Server
 *
 * 提供三个搜索工具：
 * 1. search_competitors     —— 搜索竞品功能
 * 2. search_best_practices  —— 搜索最佳实践
 * 3. search_tech_stack      —— 搜索技术选型
 *
 * 底层实现：
 * - 有 TAVILY_API_KEY 环境变量时调用 Tavily Search API
 * - 无 API Key 时自动降级为 Mock 模式，返回预置结果
 *   （Mock 数据覆盖：批量导入、权限设计、实时通信三个场景）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "web-search-mcp",
  version: "0.1.0",
});

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface SearchResponse {
  source: "tavily" | "mock";
  query: string;
  results: SearchResult[];
}

/* ------------------------------------------------------------------ */
/* Tavily Search API                                                  */
/* ------------------------------------------------------------------ */

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "basic" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Tavily API 请求失败：HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    snippet: r.content ?? "",
    url: r.url ?? "",
  }));
}

/* ------------------------------------------------------------------ */
/* Mock 模式（覆盖：批量导入 / 权限设计 / 实时通信）                     */
/* ------------------------------------------------------------------ */

interface MockScenario {
  key: string;
  keywords: string[];
  results: SearchResult[];
}

const MOCK_SCENARIOS: MockScenario[] = [
  {
    key: "batch-import",
    keywords: ["批量导入", "导入", "excel", "csv", "上传", "batch", "import"],
    results: [
      {
        title: "大批量数据导入的分层校验方案：先校验、再预览、后入库",
        snippet:
          "推荐将批量导入拆成「解析 -> 逐行校验 -> 错误汇总预览 -> 异步落库」四步，" +
          "万行级 Excel 用流式解析避免内存溢出，失败行生成错误报告供用户下载修正。",
        url: "https://example.com/best-practices/batch-import-validation",
      },
      {
        title: "Excel/CSV 批量导入的技术选型对比（SheetJS vs ExcelJS vs 流式解析）",
        snippet:
          "小文件（<5MB）可直接内存解析；大文件建议流式读取 + 分批写入。" +
          "需要保留样式选 ExcelJS，只取数据 SheetJS 更轻量；服务端限流防止并发导入打爆数据库。",
        url: "https://example.com/tech-stack/excel-parser-comparison",
      },
      {
        title: "竞品批量导入功能拆解：模板下载、异步任务与进度反馈",
        snippet:
          "主流 SaaS 产品的批量导入均提供：标准模板下载、字段校验规则说明、" +
          "导入进度条（轮询/SSE 推送）、部分成功时的错误行导出。可作为功能对齐清单。",
        url: "https://example.com/competitors/batch-import-feature-review",
      },
    ],
  },
  {
    key: "permission-design",
    keywords: ["权限", "rbac", "角色", "授权", "鉴权", "permission", "role", "auth", "sso"],
    results: [
      {
        title: "RBAC 权限模型设计：角色-权限-资源三层模型与数据权限扩展",
        snippet:
          "功能权限用 RBAC（用户-角色-权限点），数据权限在 RBAC 之上叠加行级过滤" +
          "（本部门/本人工scope）。权限点建议按「资源:操作」命名（如 order:export），前端按钮级控制。",
        url: "https://example.com/best-practices/rbac-design",
      },
      {
        title: "权限系统常见坑：越权校验只做前端、角色爆炸与权限继承",
        snippet:
          "后端每个接口必须独立鉴权，不能依赖前端隐藏入口；角色数量爆炸时改用「角色组 + 权限标签」；" +
          "变更角色后注意清理缓存与已签发 JWT 中的权限快照。",
        url: "https://example.com/best-practices/permission-pitfalls",
      },
      {
        title: "竞品权限功能对比：多租户、自定义角色与审批流权限",
        snippet:
          "头部竞品普遍支持：预置角色 + 自定义角色、菜单/按钮/字段三级权限、" +
          "敏感操作二次审批。若产品面向多租户，还需租户级角色隔离设计。",
        url: "https://example.com/competitors/permission-feature-review",
      },
    ],
  },
  {
    key: "realtime-comm",
    keywords: ["实时", "推送", "websocket", "sse", "消息", "通知", "realtime", "real-time", "socket"],
    results: [
      {
        title: "实时通信选型：WebSocket vs SSE vs 轮询的适用场景",
        snippet:
          "单向服务端推送（通知/进度）首选 SSE，实现简单且自带断线重连；" +
          "双向交互（协作编辑/聊天）用 WebSocket；低频更新轮询最省成本。网关需支持长连接与心跳保活。",
        url: "https://example.com/tech-stack/realtime-protocol-comparison",
      },
      {
        title: "消息推送最佳实践：连接网关、消息幂等与离线补偿",
        snippet:
          "推送链路建议：业务事件 -> 消息队列 -> 推送网关 -> 客户端；" +
          "消息带去重 ID 保证幂等；断线重连后按游标拉取离线消息，避免丢失。注意水平扩容时连接路由问题。",
        url: "https://example.com/best-practices/push-notification",
      },
      {
        title: "竞品实时能力拆解：在线状态、未读数与多端同步",
        snippet:
          "主流产品的实时功能清单：未读消息角标实时更新、多端登录消息同步、" +
          "输入中状态提示、弱网降级为轮询。可作为实时模块的需求对标。",
        url: "https://example.com/competitors/realtime-feature-review",
      },
    ],
  },
];

/** 没有命中任何场景时的通用兜底结果 */
function genericMockResults(query: string): SearchResult[] {
  return [
    {
      title: `「${query}」概览与核心概念`,
      snippet: "该主题的入门综述：核心概念、适用场景与常见误区。（当前为 Mock 模式预置结果）",
      url: "https://example.com/mock/overview",
    },
    {
      title: `「${query}」实施要点与最佳实践`,
      snippet: "落地时的关键决策点：方案拆分、风险控制与验收标准。（当前为 Mock 模式预置结果）",
      url: "https://example.com/mock/best-practices",
    },
    {
      title: `「${query}」相关方案对比`,
      snippet: "社区主流方案的横向对比与选型建议。（当前为 Mock 模式预置结果）",
      url: "https://example.com/mock/comparison",
    },
  ];
}

/** 按关键词命中数挑选最相关的 Mock 场景 */
function pickMockResults(text: string): SearchResult[] {
  const lower = text.toLowerCase();
  let best: { scenario: MockScenario; hits: number } | null = null;

  for (const scenario of MOCK_SCENARIOS) {
    const hits = scenario.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { scenario, hits };
  }

  return best ? best.scenario.results : genericMockResults(queryText(text));
}

/** 从拼接文本里还原一个可读的查询词（取第一行，截断到 40 字符） */
function queryText(text: string): string {
  return text.split("\n")[0].trim().slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* 统一搜索入口：有 Key 走 Tavily，无 Key 降级 Mock                     */
/* ------------------------------------------------------------------ */

async function runSearch(query: string): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (apiKey) {
    return { source: "tavily", query, results: await tavilySearch(query, apiKey) };
  }
  return { source: "mock", query, results: pickMockResults(query) };
}

/** 把 tool 返回值包装成 MCP content */
function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/* ------------------------------------------------------------------ */
/* 三个搜索工具                                                        */
/* ------------------------------------------------------------------ */

server.registerTool(
  "search_competitors",
  {
    title: "竞品功能搜索",
    description: "搜索竞品在某个功能/领域的做法，返回结果列表（title/snippet/url）。" +
      "配置 TAVILY_API_KEY 时走 Tavily 搜索，否则返回 Mock 预置结果。",
    inputSchema: {
      query: z.string().min(1).describe("要搜索的功能或领域，如“批量导入订单”"),
      domain: z.string().optional().describe("限定行业/领域，如“电商”“SaaS”"),
    },
  },
  async ({ query, domain }) =>
    jsonContent(await runSearch(["竞品功能", query, domain].filter(Boolean).join(" "))),
);

server.registerTool(
  "search_best_practices",
  {
    title: "最佳实践搜索",
    description: "搜索某个主题在行业内的最佳实践，返回结果列表（title/snippet/url）。" +
      "配置 TAVILY_API_KEY 时走 Tavily 搜索，否则返回 Mock 预置结果。",
    inputSchema: {
      topic: z.string().min(1).describe("主题，如“权限设计”"),
      industry: z.string().optional().describe("限定行业，如“金融”“电商”"),
    },
  },
  async ({ topic, industry }) =>
    jsonContent(await runSearch(["最佳实践", topic, industry].filter(Boolean).join(" "))),
);

server.registerTool(
  "search_tech_stack",
  {
    title: "技术选型搜索",
    description: "搜索某个技术方向/库的选型对比与建议，返回结果列表（title/snippet/url）。" +
      "配置 TAVILY_API_KEY 时走 Tavily 搜索，否则返回 Mock 预置结果。",
    inputSchema: {
      technology: z.string().min(1).describe("技术方向或候选方案，如“实时通信用 WebSocket 还是 SSE”"),
      useCase: z.string().optional().describe("使用场景，如“高并发消息推送”"),
    },
  },
  async ({ technology, useCase }) =>
    jsonContent(await runSearch(["技术选型", technology, useCase].filter(Boolean).join(" "))),
);

/* ------------------------------------------------------------------ */
/* 启动（stdio transport）                                             */
/* ------------------------------------------------------------------ */

async function main() {
  const hasKey = Boolean(process.env.TAVILY_API_KEY);
  console.error(`[web-search-mcp] 启动，搜索后端：${hasKey ? "Tavily API" : "Mock 模式（未配置 TAVILY_API_KEY）"}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
