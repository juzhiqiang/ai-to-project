import { Injectable, Logger } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/** MCP Server 连接配置（stdio 传输） */
export interface MCPClientConfig {
  /** 启动 MCP Server 的命令，如 "bun"、"node" */
  command: string;
  /** 命令参数 */
  args?: string[];
  /** 传递给 MCP Server 子进程的环境变量 */
  env?: Record<string, string>;
  /** connect / callTool 的超时时间（ms），默认 30000 */
  timeout?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * MCP Client 服务：封装 @modelcontextprotocol/sdk 的 Client，
 * 以 stdio 方式连接外部 MCP Server。
 *
 * connect() 成功后自动 listTools 并缓存，供 getTools() / 桥接器使用。
 */
@Injectable()
export class MCPClientService {
  private readonly logger = new Logger(MCPClientService.name);
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private readonly timeoutMs: number;

  constructor(private readonly config: MCPClientConfig) {
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /** 是否已连接（client 存在且 transport 未关闭） */
  isConnected(): boolean {
    return this.client !== null;
  }

  /** 连接 MCP Server，成功后自动 listTools 缓存工具列表 */
  async connect(): Promise<void> {
    if (this.isConnected()) return;

    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
    });
    const client = new Client({ name: "api-mcp-client", version: "0.1.0" });

    try {
      await this.withTimeout(
        client.connect(transport),
        `连接 MCP Server 超时（${this.timeoutMs}ms）：${this.config.command}`,
      );
      // 连接成功后立即拉取并缓存工具列表
      const { tools } = await client.listTools(undefined, { timeout: this.timeoutMs });
      this.tools = tools;
      this.client = client;
      this.transport = transport;
      this.logger.log(`已连接 MCP Server：${this.config.command}，缓存 ${tools.length} 个工具`);
    } catch (err) {
      // 连接失败时回收子进程，避免留下僵尸进程
      await client.close().catch(() => undefined);
      throw err;
    }
  }

  /** 获取 connect 时缓存的工具列表 */
  getTools(): Tool[] {
    return this.tools;
  }

  /** 调用 MCP Server 上的工具 */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) {
      throw new Error("MCP Client 尚未连接，请先调用 connect()");
    }
    const known = this.tools.some((t) => t.name === name);
    if (!known) {
      throw new Error(`MCP Server 上不存在工具 "${name}"，可用工具：${this.tools.map((t) => t.name).join(", ")}`);
    }
    return this.client.callTool({ name, arguments: args }, undefined, { timeout: this.timeoutMs });
  }

  /** 关闭连接并清理缓存 */
  async close(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.tools = [];
    await client.close();
    this.logger.log("MCP Client 已关闭");
  }

  private withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(message)), this.timeoutMs),
      ),
    ]);
  }

  /** 供日志/调试使用 */
  get transportInfo(): string | null {
    return this.transport ? `${this.config.command} ${(this.config.args ?? []).join(" ")}` : null;
  }
}
