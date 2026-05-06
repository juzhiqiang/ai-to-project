import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 运行时 workspace 根目录：所有业务文件读写都必须收束到这里。
const WORKSPACE_DIR = resolve(process.cwd(), 'workspace');

// 文件沙箱入口：拒绝绝对路径和 ../ 越界，防止模型工具访问 workspace 外部文件。
function safePath(workspaceRelativePath: string) {
  if (isAbsolute(workspaceRelativePath)) {
    throw new Error('Path must stay inside workspace and be relative.');
  }

  const targetPath = resolve(WORKSPACE_DIR, workspaceRelativePath);
  const relativePath = relative(WORKSPACE_DIR, targetPath);

  // relative 以 .. 开头，或自身变成绝对路径，都说明 targetPath 已逃出 workspace。
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Path escapes workspace sandbox.');
  }

  return targetPath;
}

// 订单工具只接收订单号，再映射到固定 orders 目录，避免模型直接拼任意文件路径。
export const queryOrderTool = tool(
  async ({ orderId }: { orderId: string }) => {
    return readFile(safePath(join('orders', `${orderId}.json`)), 'utf8');
  },
  {
    name: 'query_order',
    description: '根据订单号读取 workspace/orders/{orderId}.json 中的订单详情。',
    schema: z.object({
      orderId: z.string().describe('订单号，例如 EC20240315001。'),
    }),
  },
);

// 商品工具同样使用固定目录映射，保持业务查询入口收敛。
export const queryProductTool = tool(
  async ({ productId }: { productId: string }) => {
    return readFile(safePath(join('products', `${productId}.json`)), 'utf8');
  },
  {
    name: 'query_product',
    description: '根据商品 ID 读取 workspace/products/{productId}.json 中的商品详情。',
    schema: z.object({
      productId: z.string().describe('商品 ID。'),
    }),
  },
);

// 通用读取工具用于政策、FAQ 等 workspace 内相对路径文件。
export const readWorkspaceFileTool = tool(
  async ({ path }: { path: string }) => {
    return readFile(safePath(path), 'utf8');
  },
  {
    name: 'read_file',
    description: '读取 workspace/ 下指定相对路径的文件内容，例如 policies/return-policy.md。',
    schema: z.object({
      path: z.string().describe('workspace 内的相对路径，不包含 workspace/ 前缀。'),
    }),
  },
);

// 通用写入工具用于生成工单和报告；写入前会创建父目录。
export const writeWorkspaceFileTool = tool(
  async ({ path, content }: { path: string; content: string }) => {
    const targetPath = safePath(path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');

    return JSON.stringify({
      path,
      written: true,
    });
  },
  {
    name: 'write_file',
    description: '将内容写入 workspace/ 下指定相对路径，用于生成工单或报告。',
    schema: z.object({
      path: z.string().describe('workspace 内的相对路径，不包含 workspace/ 前缀。'),
      content: z.string().describe('要写入文件的完整内容。'),
    }),
  },
);

// 统一导出给 FilesystemService 绑定到模型，并由 tool-loop 执行。
export const businessTools = [queryOrderTool, queryProductTool, readWorkspaceFileTool, writeWorkspaceFileTool];

export { safePath, WORKSPACE_DIR };
