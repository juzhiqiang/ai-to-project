import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EmbeddingService } from '../../../src/llm/embedding/embedding.service';
import { INITIAL_DOCUMENT_PATHS, VectorStoreService } from '../../../src/llm/embedding/vector-store.service';

const workspaceRoot = join(process.cwd(), 'workspace');
const workspaceBackupRoot = join(process.cwd(), '.test-workspace-backup-vector-store');
const rmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 50 };

class KeywordEmbeddings {
  public readonly embedQuery = jest.fn(async (text: string) => vectorFor(text));
  public readonly embedDocuments = jest.fn(async (documents: string[]) => documents.map(vectorFor));
}

function vectorFor(text: string) {
  if (text.includes('退货') || text.includes('return')) {
    return [1, 0, 0];
  }

  if (text.includes('退款') || text.includes('refund')) {
    return [0, 1, 0];
  }

  return [0, 0, 1];
}

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
  mkdirSync(join(workspaceRoot, 'policies'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'faq'), { recursive: true });
  writeFileSync(join(workspaceRoot, 'policies', 'return-policy.md'), '退货政策：签收 7 天内且商品完好可退货。', 'utf8');
  writeFileSync(join(workspaceRoot, 'policies', 'refund-policy.md'), '退款政策：审核通过后 3 个工作日原路退款。', 'utf8');
  writeFileSync(join(workspaceRoot, 'faq', 'after-sale-faq.md'), '售后 FAQ：退货、退款和换货入口说明。', 'utf8');
}

describe('VectorStoreService', () => {
  beforeEach(() => {
    backupWorkspace();
    resetWorkspace();
  });

  afterEach(restoreWorkspace);

  it('stores documents and returns the most similar content', async () => {
    const service = new VectorStoreService(new EmbeddingService(new KeywordEmbeddings()));

    await expect(
      service.addDocuments([
        { content: '退货需要保持商品完好。', metadata: { source: 'manual-return' } },
        { content: '退款将在审核后处理。', metadata: { source: 'manual-refund' } },
      ]),
    ).resolves.toEqual({ added: 2 });

    await expect(service.similaritySearch('我想退货', 1)).resolves.toEqual([
      {
        content: '退货需要保持商品完好。',
        metadata: { source: 'manual-return' },
      },
    ]);
  });

  it('loads initial workspace policy and FAQ documents once', async () => {
    const service = new VectorStoreService(new EmbeddingService(new KeywordEmbeddings()));

    await expect(service.onModuleInit()).resolves.toEqual({ added: INITIAL_DOCUMENT_PATHS.length });
    await expect(service.onModuleInit()).resolves.toEqual({ added: 0 });

    const results = await service.similaritySearch('退款多久到账', 2);

    expect(results).toEqual([
      expect.objectContaining({
        content: expect.stringContaining('退款政策'),
        metadata: { source: 'policies/refund-policy.md' },
      }),
      expect.any(Object),
    ]);
  });
});
