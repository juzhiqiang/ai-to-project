/**
 * 需求分析 MCP Server
 *
 * 提供三个 tool：
 * 1. estimate_complexity   —— 正则匹配复杂因子（集成/权限/实时/AI/安全等），加权计分
 * 2. check_conflicts       —— 提取关键词，计算重叠度，重叠 >= 3 个关键词则标记冲突
 * 3. generate_user_stories —— 用正则提取角色（作为XX）和动作（能够XX），生成 User Story
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "requirement-analysis-mcp",
  version: "0.1.0",
});

/** 把 tool 返回值包装成 MCP content */
function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/* ------------------------------------------------------------------ */
/* 1. estimate_complexity                                             */
/* ------------------------------------------------------------------ */

interface ComplexityFactor {
  key: string;
  name: string;
  weight: number;
  keywords: string[];
  pattern: RegExp;
}

const COMPLEXITY_FACTORS: ComplexityFactor[] = [
  {
    key: "integration",
    name: "第三方集成",
    weight: 3,
    keywords: ["集成", "对接", "第三方", "外部系统", "webhook", "回调", "同步", "API"],
    pattern: /集成|对接|第三方|外部系统|webhook|回调|api接口/i,
  },
  {
    key: "permission",
    name: "权限与认证",
    weight: 2,
    keywords: ["权限", "角色", "RBAC", "认证", "授权", "登录", "SSO", "鉴权"],
    pattern: /权限|角色|rbac|认证|授权|登录|鉴权|sso|oauth/i,
  },
  {
    key: "realtime",
    name: "实时能力",
    weight: 3,
    keywords: ["实时", "推送", "WebSocket", "SSE", "消息队列", "流式", "即时"],
    pattern: /实时|推送|websocket|sse|消息队列|流式|即时/i,
  },
  {
    key: "ai",
    name: "AI 能力",
    weight: 4,
    keywords: ["AI", "大模型", "LLM", "RAG", "向量", "智能", "embedding", "机器学习", "推荐"],
    pattern: /\bai\b|大模型|llm|rag|向量|智能|embedding|机器学习|推荐|agent/i,
  },
  {
    key: "security",
    name: "安全合规",
    weight: 2,
    keywords: ["安全", "加密", "脱敏", "审计", "合规", "隐私", "风控"],
    pattern: /安全|加密|脱敏|审计|合规|隐私|风控/i,
  },
  {
    key: "data",
    name: "数据处理",
    weight: 2,
    keywords: ["报表", "统计", "导出", "数据分析", "迁移", "大数据"],
    pattern: /报表|统计|导出|数据分析|迁移|大数据|汇总/i,
  },
  {
    key: "performance",
    name: "性能与规模",
    weight: 2,
    keywords: ["高并发", "性能", "缓存", "分库分表", "百万", "扩容"],
    pattern: /高并发|性能|缓存|分库|分表|百万|千万|扩容|压测/i,
  },
  {
    key: "workflow",
    name: "业务流程",
    weight: 2,
    keywords: ["审批", "工作流", "状态机", "流程引擎", "多级"],
    pattern: /审批|工作流|状态机|流程引擎|多级/i,
  },
];

/** 复杂度分数 -> 规模档位 / 估算工时 */
const SIZE_RULES: Array<{ maxSizeScore: number; size: "S" | "M" | "L" | "XL"; estimatedDays: number }> = [
  { maxSizeScore: 3, size: "S", estimatedDays: 2 },
  { maxSizeScore: 8, size: "M", estimatedDays: 6 },
  { maxSizeScore: 15, size: "L", estimatedDays: 14 },
  { maxSizeScore: Infinity, size: "XL", estimatedDays: 30 },
];

server.registerTool(
  "estimate_complexity",
  {
    title: "需求复杂度评估",
    description:
      "根据需求文本（可选附带技术栈）评估开发复杂度：正则匹配集成/权限/实时/AI/安全等复杂因子并加权计分，" +
      "返回 size(S/M/L/XL)、estimatedDays、complexityScore 和命中的 factors 列表。评估为粗略估计，仅供排期参考。",
    inputSchema: {
      requirementText: z.string().min(1).describe("需求描述文本"),
      techStack: z.array(z.string()).optional().describe("预期使用的技术栈，可选"),
    },
  },
  async ({ requirementText, techStack }) => {
    const text = [requirementText, ...(techStack ?? [])].join("\n");

    let complexityScore = 0;
    const factors = COMPLEXITY_FACTORS.map((factor) => {
      const matchedKeywords = factor.keywords.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()));
      const matched = matchedKeywords.length > 0 || factor.pattern.test(text);
      if (matched) complexityScore += factor.weight;
      return {
        key: factor.key,
        name: factor.name,
        weight: factor.weight,
        matched,
        matchedKeywords: matched ? matchedKeywords : [],
      };
    });

    const rule = SIZE_RULES.find((r) => complexityScore <= r.maxSizeScore)!;

    return jsonContent({
      size: rule.size,
      estimatedDays: rule.estimatedDays,
      complexityScore,
      factors,
    });
  },
);

/* ------------------------------------------------------------------ */
/* 2. check_conflicts                                                 */
/* ------------------------------------------------------------------ */

/** 英文停用词 */
const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "from",
  "is", "are", "be", "been", "it", "its", "as", "that", "this", "these", "those", "we", "our",
  "can", "should", "will", "must", "may", "need", "want", "user", "system", "page", "app",
]);

/** 中文虚字（用于过滤无意义的二元组） */
const ZH_STOP_CHARS = new Set([..."的了与或及并把被从到向以将该此这那是在和为个等所可以需要"]);

/**
 * 简易关键词提取：
 * - 英文：按连续字母数字切词，过滤停用词
 * - 中文：按标点/空白切段后取二元组（bigram）
 */
function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();

  for (const word of text.toLowerCase().match(/[a-z][a-z0-9+#.\-]+/g) ?? []) {
    if (word.length >= 2 && !EN_STOPWORDS.has(word)) keywords.add(word);
  }

  const zhSegments = text.replace(/[^一-龥]+/g, " ").split(/\s+/).filter(Boolean);
  for (const seg of zhSegments) {
    if (seg.length === 1) {
      keywords.add(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) {
      const bigram = seg.slice(i, i + 2);
      // 过滤两个位置都落在虚字上的组合（如 “的了”“以可”）
      if (ZH_STOP_CHARS.has(bigram[0]) && ZH_STOP_CHARS.has(bigram[1])) continue;
      keywords.add(bigram);
    }
  }

  return keywords;
}

server.registerTool(
  "check_conflicts",
  {
    title: "需求冲突检测",
    description:
      "检测新需求与已有需求是否存在重叠：对文本提取关键词（英文分词 + 中文二元组），" +
      "计算新需求与每条已有需求的关键词重叠度，重叠 >= 3 个关键词即标记为冲突。",
    inputSchema: {
      newRequirement: z.string().min(1).describe("新增需求的描述（可含标题+详情）"),
      existingRequirements: z
        .array(
          z.object({
            id: z.string().describe("已有需求 ID"),
            title: z.string().describe("已有需求标题"),
            description: z.string().describe("已有需求描述"),
          }),
        )
        .describe("已有需求列表"),
    },
  },
  async ({ newRequirement, existingRequirements }) => {
    const newKeywords = extractKeywords(newRequirement);

    const conflicts = existingRequirements
      .map((req) => {
        const existingKeywords = extractKeywords(`${req.title} ${req.description}`);
        const overlapKeywords = [...newKeywords].filter((kw) => existingKeywords.has(kw));
        return { id: req.id, title: req.title, overlapCount: overlapKeywords.length, overlapKeywords };
      })
      .filter((item) => item.overlapCount >= 3)
      .sort((a, b) => b.overlapCount - a.overlapCount);

    const hasConflicts = conflicts.length > 0;
    const suggestion = hasConflicts
      ? `发现 ${conflicts.length} 条潜在冲突需求（${conflicts.map((c) => `#${c.id}`).join("、")}），` +
        "建议先评审这些已有需求，确认是否合并、拆分或调整边界，避免重复建设。"
      : "未发现明显冲突（所有已有需求重叠关键词均少于 3 个），可以继续推进。";

    return jsonContent({
      hasConflicts,
      conflictCount: conflicts.length,
      conflicts,
      suggestion,
    });
  },
);

/* ------------------------------------------------------------------ */
/* 3. generate_user_stories                                           */
/* ------------------------------------------------------------------ */

/** 角色连接词（提取后从角色尾部剥离，如 “管理员我希望” -> “管理员”） */
const ROLE_CONNECTORS = /(我希望|我想要|我想|我要|想要|希望|能够|可以|需要|我将)/g;
/** 动作引导词（命中后捕获其后的动作内容） */
const ACTION_RE = /(?:能够|可以|希望|想要|需要|支持|我要|我想)([^，。;；！!？?\n]{2,40})/g;
/** 角色引导词 */
const ROLE_RE = /作为([一-龥A-Za-z0-9_ ]{2,20})/g;
/** 动作捕获后需剥离的引导词残留（如“希望能配置”命中“希望”后捕获串以“能配置”开头） */
const ACTION_LEADING = /^(能够|可以|希望|想要|需要|支持|我想|我要|能|可)+/;

function extractMatches(text: string, re: RegExp, clean?: (raw: string) => string): string[] {
  const results: string[] = [];
  for (const match of text.matchAll(re)) {
    const raw = (match[1] ?? "").trim();
    const value = clean ? clean(raw) : raw;
    if (value.length >= 2 && !results.includes(value)) results.push(value);
  }
  return results;
}

server.registerTool(
  "generate_user_stories",
  {
    title: "User Story 生成",
    description:
      "从需求文本中用正则提取角色（“作为XX”）和动作（“能够XX / 可以XX / 希望XX”等），" +
      "生成标准 User Story（含验收标准和优先级）。默认最多 3 条。",
    inputSchema: {
      requirementText: z.string().min(1).describe("需求描述文本"),
      maxStories: z.number().int().min(1).max(10).default(3).describe("最多生成的 User Story 数量，默认 3"),
    },
  },
  async ({ requirementText, maxStories }) => {
    const roles = extractMatches(requirementText, ROLE_RE, (raw) =>
      // 剥离角色后携带的连接词：“管理员我希望” -> “管理员”
      raw.replace(ROLE_CONNECTORS, " ").split(" ")[0].trim(),
    );
    const actions = extractMatches(requirementText, ACTION_RE, (raw) =>
      // 剥离捕获串开头残留的引导词：“希望能配置”命中“希望”后捕获串为“能配置...”
      raw.replace(ACTION_LEADING, "").trim(),
    );

    // 未提取到角色/动作时，退化为以整段需求生成一条通用 story
    if (roles.length === 0 || actions.length === 0) {
      const fallbackAction = requirementText.replace(/\s+/g, " ").trim().slice(0, 40);
      return jsonContent({
        stories: [
          {
            id: "US-001",
            story: `作为用户，我希望${fallbackAction}，以满足业务需要`,
            acceptanceCriteria: [
              `“${fallbackAction}”相关功能可正常使用`,
              "正常输入与异常输入下系统均有明确反馈",
            ],
            priority: "high",
          },
        ],
      });
    }

    const priorityByIndex = ["high", "medium", "low"] as const;
    const stories = Array.from({ length: Math.min(maxStories, Math.max(roles.length, actions.length)) }, (_, i) => {
      const role = roles[i % roles.length];
      const action = actions[i % actions.length];
      const priority = priorityByIndex[Math.min(i, priorityByIndex.length - 1)];

      // 把动作拆成子项作为验收标准（按顿号/逗号/以及/和切分）
      const parts = action
        .split(/[、，,;；]|以及|和/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2);
      const criteriaSources = parts.length > 0 ? parts.slice(0, 3) : [action];
      const acceptanceCriteria = [
        ...criteriaSources.map((p) => `当执行「${p}」时，系统应正确处理并给出明确反馈`),
        "功能在正常与异常输入下均有合理表现",
      ];

      return {
        id: `US-${String(i + 1).padStart(3, "0")}`,
        story: `作为${role}，我希望${action}`,
        acceptanceCriteria,
        priority,
      };
    });

    return jsonContent({ stories });
  },
);

/* ------------------------------------------------------------------ */
/* 启动（stdio transport）                                            */
/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
