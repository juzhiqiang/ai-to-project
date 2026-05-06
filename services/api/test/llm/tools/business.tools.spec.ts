import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { businessTools } from '../../../src/llm/tools/business.tools';

const workspaceRoot = join(process.cwd(), 'workspace');
const workspaceBackupRoot = join(process.cwd(), '.test-workspace-backup-business-tools');
const rmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 50 };
const orderId = 'EC20240315001';
const productId = 'P-BT-001';

function backupWorkspace() {
  rmSync(workspaceBackupRoot, rmOptions);

  if (existsSync(workspaceRoot)) {
    cpSync(workspaceRoot, workspaceBackupRoot, { recursive: true });
  }
}

function restoreWorkspace() {
  rmSync(workspaceRoot, rmOptions);

  if (existsSync(workspaceBackupRoot)) {
    cpSync(workspaceBackupRoot, workspaceRoot, { recursive: true });
    rmSync(workspaceBackupRoot, rmOptions);
  }
}

function resetWorkspace() {
  rmSync(workspaceRoot, rmOptions);
  mkdirSync(join(workspaceRoot, 'orders'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'products'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'policies'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, 'orders', `${orderId}.json`),
    JSON.stringify({
      orderId,
      productId,
      paidAt: '2024-03-15T10:00:00+08:00',
      status: 'delivered',
    }),
    'utf8',
  );
  writeFileSync(
    join(workspaceRoot, 'products', `${productId}.json`),
    JSON.stringify({
      productId,
      name: '蓝牙耳机',
      category: 'electronics',
    }),
    'utf8',
  );
  writeFileSync(join(workspaceRoot, 'policies', 'return-policy.md'), '7 天内可申请退货。', 'utf8');
}

describe('businessTools', () => {
  beforeEach(() => {
    backupWorkspace();
    resetWorkspace();
  });

  afterEach(restoreWorkspace);

  it('defines order, product, read, and write tools', () => {
    expect(businessTools.map((item) => item.name)).toEqual([
      'query_order',
      'query_product',
      'read_file',
      'write_file',
    ]);
  });

  it('queries an order from workspace/orders', async () => {
    const tool = businessTools.find((item) => item.name === 'query_order');

    await expect(tool?.invoke({ orderId })).resolves.toContain('"status":"delivered"');
  });

  it('queries a product from workspace/products', async () => {
    const tool = businessTools.find((item) => item.name === 'query_product');

    await expect(tool?.invoke({ productId })).resolves.toContain('"name":"蓝牙耳机"');
  });

  it('reads and writes files under workspace', async () => {
    const readTool = businessTools.find((item) => item.name === 'read_file');
    const writeTool = businessTools.find((item) => item.name === 'write_file');

    await expect(readTool?.invoke({ path: 'policies/return-policy.md' })).resolves.toContain('7 天内可申请退货');
    await expect(
      writeTool?.invoke({
        path: 'tickets/EC20240315001-analysis.md',
        content: '订单 EC20240315001 可进入退货审核。',
      }),
    ).resolves.toContain('"written":true');
    expect(readFileSync(join(workspaceRoot, 'tickets', 'EC20240315001-analysis.md'), 'utf8')).toBe(
      '订单 EC20240315001 可进入退货审核。',
    );
  });

  it('rejects paths that escape workspace', async () => {
    const readTool = businessTools.find((item) => item.name === 'read_file');
    const writeTool = businessTools.find((item) => item.name === 'write_file');

    await expect(readTool?.invoke({ path: '../package.json' })).rejects.toThrow(/workspace/);
    await expect(writeTool?.invoke({ path: '../escape.md', content: 'nope' })).rejects.toThrow(/workspace/);
  });
});
