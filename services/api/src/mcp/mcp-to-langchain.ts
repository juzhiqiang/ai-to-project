import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { MCPClientService } from "./mcp-client.service";

/** MCP 工具的 JSON Schema（inputSchema）中我们关心的字段子集 */
interface JsonSchemaField {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaField>;
  required?: string[];
  enum?: Array<string | number>;
  items?: JsonSchemaField;
  default?: unknown;
}

/**
 * 把 MCP 工具的 JSON Schema 转成 ZodObject，
 * 支持 string / number / boolean / array / object / optional / enum。
 */
export function jsonSchemaToZod(schema: JsonSchemaField): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [key, field] of Object.entries(properties)) {
    let zodType = fieldToZod(field);

    // 未出现在 required 中的字段视为可选
    if (!required.has(key)) zodType = zodType.optional();

    shape[key] = zodType;
  }

  return z.object(shape);
}

/** 单个 JSON Schema 字段 -> Zod 类型（不含 optional 包装） */
function fieldToZod(field: JsonSchemaField): z.ZodTypeAny {
  const description = field.description;

  // type 可能是数组（如 ["string", "null"]），取第一个非 null 类型
  const type = Array.isArray(field.type) ? field.type.find((t) => t !== "null") : field.type;

  switch (type) {
    case "string":
      if (field.enum && field.enum.length > 0) {
        return z.enum(field.enum.map(String) as [string, ...string[]]).describe(description ?? "");
      }
      return z.string().describe(description ?? "");
    case "number":
    case "integer":
      return z.number().describe(description ?? "");
    case "boolean":
      return z.boolean().describe(description ?? "");
    case "array":
      return z.array(itemsToZod(field.items)).describe(description ?? "");
    case "object":
      if (!field.properties || Object.keys(field.properties).length === 0) {
        return z.record(z.unknown()).describe(description ?? "");
      }
      return jsonSchemaToZod(field).describe(description ?? "");
    default:
      // 未知类型兜底为 any，避免桥接时丢字段
      return z.any().describe(description ?? "");
  }
}

/** array 字段的 items -> Zod 类型 */
function itemsToZod(items?: JsonSchemaField): z.ZodTypeAny {
  if (!items) return z.unknown();
  const type = Array.isArray(items.type) ? items.type.find((t) => t !== "null") : items.type;
  if (type === "object" && items.properties) return jsonSchemaToZod(items);
  return fieldToZod(items);
}

/**
 * MCP 返回的 content[] 序列化为字符串：
 * - text：直接取 text
 * - image / audio：返回 [image: mimeType] 形式的占位符
 * - resource：取 text（有则）或 [resource: uri]
 * - 其他：JSON 序列化
 */
export function serializeMCPContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");

  return content
    .map((block) => {
      if (typeof block === "string") return block;
      const item = block as { type?: string; text?: string; mimeType?: string; uri?: string };
      switch (item.type) {
        case "text":
          return item.text ?? "";
        case "image":
        case "audio":
          return `[${item.type}: ${item.mimeType ?? "unknown"}]`;
        case "resource":
          return item.text ?? `[resource: ${item.uri ?? "unknown"}]`;
        default:
          return JSON.stringify(block);
      }
    })
    .join("\n");
}

/**
 * 把 MCP Server 上的工具桥接为 LangChain DynamicStructuredTool[]：
 * - 用 jsonSchemaToZod 把工具的 inputSchema 转成 Zod schema
 * - 调用时走 client.callTool，并把返回的 content[] 序列化为字符串
 * - prefix 可给工具名加前缀（如 "mcp_"），避免与本地工具重名
 */
export function bridgeMCPToLangChain(client: MCPClientService, prefix = ""): DynamicStructuredTool[] {
  return client.getTools().map((tool: Tool) => {
    const name = `${prefix}${tool.name}`;
    return new DynamicStructuredTool({
      name,
      description: tool.description ?? name,
      schema: jsonSchemaToZod((tool.inputSchema ?? {}) as JsonSchemaField),
      func: async (args) => {
        const result = (await client.callTool(tool.name, args as Record<string, unknown>)) as {
          content?: unknown;
        };
        return serializeMCPContent(result?.content);
      },
    });
  });
}
