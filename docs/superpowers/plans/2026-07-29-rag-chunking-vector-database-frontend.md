# RAG 切分与向量数据库前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 9.2 的浏览器测试链路和 9.3 的 pgvector 仓储、索引、API、浏览器测试页及自动化测试。

**Architecture:** `services/api/rag` 保存与 NestJS 解耦的切分和检索模块，`src/llm/rag` 仅负责 HTTP 参数与依赖注入。Web 使用两个独立页面和两个 Next.js Route Handler 代理，向量数据库页提交自然语言，由后端生成 384 维 embedding 后检索 PostgreSQL。

**Tech Stack:** TypeScript、NestJS、Prisma 7、PostgreSQL pgvector、Jest、Next.js 16、React 19、Tailwind CSS、Node test

---

## 文件结构

- Create: `services/api/rag/retrieval/vector-store.ts`：参数化 upsert、维度检查、余弦检索与结果映射。
- Create: `services/api/scripts/create-hnsw-index.sql`：经人工批准执行的 HNSW 索引脚本。
- Create: `services/api/prisma/migrations/20260729000000_add_document_chunk_model_name/migration.sql`：补齐仓库实际缺失的 `modelName`。
- Modify: `services/api/prisma/schema.prisma`：让 Prisma schema 与 9.3 记录接口一致。
- Modify: `services/api/test/chapter11-rag.spec.ts`：新增 11.5 仓储行为测试。
- Modify: `services/api/src/llm/rag/rag-chunk.controller.ts`：修复 9.2 核心模块引用并补参数校验。
- Create: `services/api/src/llm/rag/rag-search.controller.ts`：文本 embedding 到 pgvector 检索的 HTTP 适配器。
- Create: `services/api/test/rag-controller.spec.ts`：两个 RAG 控制器单元测试。
- Modify: `services/api/src/llm/llm.module.ts`：注册两个 RAG 控制器。
- Modify: `clients/web/routing.test.mjs`：两个页面、首页入口和代理错误测试。
- Modify: `clients/web/app/page.tsx`：增加 9.2、9.3 入口。
- Modify: `clients/web/app/rag-chunking/page.tsx`：完成 9.2 浏览器测试体验。
- Modify: `clients/web/app/api/rag/chunk/route.ts`：保留并验证 9.2 代理。
- Create: `clients/web/app/vector-database/page.tsx`：9.3 浏览器检索测试页。
- Create: `clients/web/app/api/rag/search/route.ts`：9.3 后端代理。

### Task 1: 为 9.3 仓储写失败测试

**Files:**
- Modify: `services/api/test/chapter11-rag.spec.ts`
- Test: `services/api/test/chapter11-rag.spec.ts`

- [ ] **Step 1: 增加 11.5 的 mock-first 测试**

在现有 11.4 describe 后加入导入和测试。mock 的 `$queryRaw` 第一次返回数据库维度，第二次返回 ANN 行；暴力 KNN 使用现有 `cosineSimilarity` 对 50 条确定性向量排序。

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  similaritySearch,
  upsertChunks,
  type PrismaRawClient,
} from '../rag/retrieval/vector-store';

describe('11.5 向量数据库', () => {
  const records = Array.from({ length: 50 }, (_, index) => ({
    id: `chunk-${index}`,
    documentId: `document-${Math.floor(index / 5)}`,
    content: `第 ${index} 个切片`,
    chunkIndex: index,
    embedding: [1 + index / 100, (index % 7) / 10, (index % 3) / 10],
    modelName: 'test-embedding',
  }));

  it('11.5.2 小数据集上 KNN baseline 与 ANN 前 K 条一致', async () => {
    const query = [1, 0.2, 0.1];
    const baseline = records
      .map((record) => ({ ...record, score: cosineSimilarity(query, record.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce(baseline.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          content: row.content,
          chunkIndex: row.chunkIndex,
          modelName: row.modelName,
          distance: 1 - row.score,
        }))),
    } as unknown as PrismaRawClient;

    const ann = await similaritySearch(prisma, query, { topK: 5 });
    expect(ann.map((row) => row.id)).toEqual(baseline.map((row) => row.id));
  });

  it('11.5.6 score 等于 1 - 余弦距离', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce([{ ...records[0], distance: 0.25 }]),
    } as unknown as PrismaRawClient;
    const [result] = await similaritySearch(prisma, [1, 0, 0]);
    expect(result.score).toBeCloseTo(0.75, 9);
  });

  it('查询向量维度与数据库不一致时抛 RangeError', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ dimension: 384 }]),
    } as unknown as PrismaRawClient;
    await expect(similaritySearch(prisma, [1, 0, 0])).rejects.toThrow(RangeError);
  });

  it('upsert 拒绝空向量和批次内维度不一致', async () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaRawClient;
    await expect(upsertChunks(prisma, [{ ...records[0], embedding: [] }])).rejects.toThrow(RangeError);
    await expect(upsertChunks(prisma, [records[0], { ...records[1], embedding: [1, 2] }])).rejects.toThrow(RangeError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('upsert 对每条合法记录执行参数化查询', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaRawClient;
    await expect(upsertChunks(prisma, records.slice(0, 2))).resolves.toBe(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('HNSW 脚本使用余弦索引及指定参数', () => {
    const sql = readFileSync(join(__dirname, '../scripts/create-hnsw-index.sql'), 'utf8');
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i);
    expect(sql).toMatch(/USING hnsw\s*\("embedding" vector_cosine_ops\)/i);
    expect(sql).toMatch(/m\s*=\s*16/i);
    expect(sql).toMatch(/ef_construction\s*=\s*64/i);
    expect(sql).toMatch(/先完成全量向量入库/);
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cd services/api && bun run test -- chapter11-rag.spec.ts`

Expected: FAIL，原因是 `../rag/retrieval/vector-store` 不存在。

- [ ] **Step 3: 提交测试**

```powershell
git add services/api/test/chapter11-rag.spec.ts
git commit -m "补充 9.3 向量仓储失败测试"
```

### Task 2: 实现 9.3 仓储、schema 和索引脚本

**Files:**
- Create: `services/api/rag/retrieval/vector-store.ts`
- Create: `services/api/scripts/create-hnsw-index.sql`
- Create: `services/api/prisma/migrations/20260729000000_add_document_chunk_model_name/migration.sql`
- Modify: `services/api/prisma/schema.prisma`
- Test: `services/api/test/chapter11-rag.spec.ts`

- [ ] **Step 1: 实现最小可用仓储**

`vector-store.ts` 定义如下公开 API，并用参数化 tagged template 调用 `$queryRaw`：

```ts
export interface PrismaRawClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface VectorStoreRecord {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  modelName: string;
}

export interface SearchOptions { topK?: number; modelName?: string }
export interface SearchResult extends Omit<VectorStoreRecord, 'embedding'> {
  distance: number;
  score: number;
}

function vectorLiteral(vector: number[]): string {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) {
    throw new RangeError('向量必须包含有限数值');
  }
  return `[${vector.join(',')}]`;
}

export async function upsertChunks(prisma: PrismaRawClient, records: VectorStoreRecord[]): Promise<number> {
  if (!records.length) return 0;
  const dimension = records[0].embedding.length;
  records.forEach((record) => {
    vectorLiteral(record.embedding);
    if (record.embedding.length !== dimension) throw new RangeError('记录向量维度不一致');
  });
  for (const record of records) {
    const embedding = vectorLiteral(record.embedding);
    await prisma.$queryRaw`
      INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex", "embedding", "modelName")
      VALUES (${record.id}, ${record.documentId}, ${record.content}, ${record.chunkIndex}, ${embedding}::vector, ${record.modelName})
      ON CONFLICT ("documentId", "chunkIndex") DO UPDATE SET
        "content" = EXCLUDED."content", "embedding" = EXCLUDED."embedding", "modelName" = EXCLUDED."modelName"
      RETURNING "id"
    `;
  }
  return records.length;
}

export async function similaritySearch(
  prisma: PrismaRawClient,
  queryVector: number[],
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const query = vectorLiteral(queryVector);
  const topK = options.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new RangeError('topK 必须是 1 到 100 的整数');
  const dimensions = await prisma.$queryRaw<Array<{ dimension: number }>>`
    SELECT vector_dims("embedding")::int AS "dimension"
    FROM "DocumentChunk" WHERE "embedding" IS NOT NULL LIMIT 1
  `;
  if (!dimensions.length) return [];
  if (dimensions[0].dimension !== queryVector.length) {
    throw new RangeError(`查询向量维度 ${queryVector.length} 与数据库维度 ${dimensions[0].dimension} 不一致`);
  }
  const modelName = options.modelName?.trim() || null;
  const rows = await prisma.$queryRaw<Array<Omit<SearchResult, 'score'>>>`
    SELECT "id", "documentId", "content", "chunkIndex", "modelName",
      ("embedding" <=> ${query}::vector)::float8 AS "distance"
    FROM "DocumentChunk"
    WHERE "embedding" IS NOT NULL AND (${modelName}::text IS NULL OR "modelName" = ${modelName})
    ORDER BY "embedding" <=> ${query}::vector LIMIT ${topK}
  `;
  return rows.map((row) => ({ ...row, score: 1 - Number(row.distance) }));
}
```

- [ ] **Step 2: 补齐 schema 与迁移**

在 `DocumentChunk` 中加入 `modelName String @default("unknown")`。迁移内容为：

```sql
ALTER TABLE "DocumentChunk"
ADD COLUMN "modelName" TEXT NOT NULL DEFAULT 'unknown';
```

- [ ] **Step 3: 创建 HNSW 脚本**

```sql
-- 先完成全量向量入库，再由运维人工批准执行本脚本。
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

- [ ] **Step 4: 运行仓储测试与 Prisma 校验并确认 GREEN**

Run: `cd services/api && bun run test -- chapter11-rag.spec.ts`

Expected: PASS，16 tests。

Run: `cd services/api && bunx prisma validate`

Expected: `The schema ... is valid`。

- [ ] **Step 5: 提交仓储实现**

```powershell
git add services/api/rag/retrieval/vector-store.ts services/api/scripts/create-hnsw-index.sql services/api/prisma/schema.prisma services/api/prisma/migrations/20260729000000_add_document_chunk_model_name/migration.sql services/api/test/chapter11-rag.spec.ts
git commit -m "实现 9.3 pgvector 仓储与 HNSW 索引"
```

### Task 3: 用 TDD 完成 RAG HTTP 控制器

**Files:**
- Create: `services/api/test/rag-controller.spec.ts`
- Modify: `services/api/src/llm/rag/rag-chunk.controller.ts`
- Create: `services/api/src/llm/rag/rag-search.controller.ts`
- Modify: `services/api/src/llm/llm.module.ts`

- [ ] **Step 1: 写控制器失败测试**

测试普通切分、Parent-Child、空文本 400、文本 embedding 检索、空查询 400 和维度异常转 400。检索成功断言 `embedQuery('退款规则')` 被调用，并返回 `{ query, dimension, count, results }`。

```ts
import { BadRequestException } from '@nestjs/common';
import { RagChunkController } from '../src/llm/rag/rag-chunk.controller';
import { RagSearchController } from '../src/llm/rag/rag-search.controller';

describe('RAG controllers', () => {
  it('普通切分返回可还原偏移量', async () => {
    const text = '甲'.repeat(600);
    const response = await new RagChunkController().chunk({
      text,
      chunkSize: 500,
      chunkOverlap: 50,
      mode: 'normal',
    });
    expect(response.mode).toBe('normal');
    const chunks = response.chunks as Array<{ content: string; startOffset: number; endOffset: number }>;
    chunks.forEach((chunk) => {
      expect(text.substring(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
    });
  });

  it('空切分文本抛 BadRequestException', async () => {
    await expect(new RagChunkController().chunk({ text: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('查询文本先 embedding 再检索 pgvector', async () => {
    const embeddingService = { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) };
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ dimension: 3 }])
        .mockResolvedValueOnce([{
          id: 'chunk-1', documentId: 'document-1', content: '退款规则', chunkIndex: 0,
          modelName: 'test-embedding', distance: 0.1,
        }]),
    };
    const controller = new RagSearchController(embeddingService as never, prisma as never);
    const result = await controller.search({ query: '退款规则', topK: 3 });
    expect(embeddingService.embedQuery).toHaveBeenCalledWith('退款规则');
    expect(result).toMatchObject({ query: '退款规则', dimension: 3, count: 1 });
    expect(result.results[0].score).toBeCloseTo(0.9, 9);
  });

  it('空查询抛 BadRequestException', async () => {
    const controller = new RagSearchController({ embedQuery: jest.fn() } as never, {} as never);
    await expect(controller.search({ query: ' ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('维度不匹配映射为 BadRequestException', async () => {
    const embeddingService = { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) };
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce([{ dimension: 384 }]) };
    const controller = new RagSearchController(embeddingService as never, prisma as never);
    await expect(controller.search({ query: '退款规则' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cd services/api && bun run test -- rag-controller.spec.ts`

Expected: FAIL，原因是 `RagSearchController` 不存在，且当前 chunk 控制器引用路径错误。

- [ ] **Step 3: 实现控制器并注册模块**

`RagChunkController` 从 `../../../rag/chunking/document-chunker` 导入 `chunkText`，从 `../../../rag/chunking/parent-child-chunker` 导入 `chunkParentChild`，并用 `BadRequestException` 拒绝空文本、非法大小和未知模式。`RagSearchController` 注入 `EmbeddingService`、`PrismaService`，调用：

```ts
const query = body.query?.trim();
if (!query) throw new BadRequestException('query 不能为空');
const vector = await this.embeddingService.embedQuery(query);
try {
  const results = await similaritySearch(this.prisma, vector, {
    topK: body.topK ?? 5,
    modelName: body.modelName,
  });
  return { query, dimension: vector.length, count: results.length, results };
} catch (error) {
  if (error instanceof RangeError) throw new BadRequestException(error.message);
  throw error;
}
```

在 `LlmModule.controllers` 中加入 `RagChunkController`、`RagSearchController`。

- [ ] **Step 4: 运行控制器测试、API 类型检查并确认 GREEN**

Run: `cd services/api && bun run test -- rag-controller.spec.ts && bun run typecheck`

Expected: 控制器测试 PASS，TypeScript exit 0。

- [ ] **Step 5: 提交 HTTP 链路**

```powershell
git add services/api/src/llm/rag services/api/src/llm/llm.module.ts services/api/test/rag-controller.spec.ts
git commit -m "接入 RAG 切分与向量检索接口"
```

### Task 4: 为两个浏览器测试页写失败测试

**Files:**
- Modify: `clients/web/routing.test.mjs`
- Test: `clients/web/routing.test.mjs`

- [ ] **Step 1: 完成 9.2 断言并新增 9.3 断言**

测试必须检查：首页两个链接；切分页的模式、`chunkSize`、`chunkOverlap` 和 POST 路径；向量数据库页的 query、topK、modelName、结果 score 和 POST 路径；两个代理的 `API_ORIGIN`、后端路径和 502 分支。

```js
test("home page links to both RAG playgrounds", () => {
  assert.match(pageSource, /href="\/rag-chunking"/);
  assert.match(pageSource, /文档切分测试/);
  assert.match(pageSource, /href="\/vector-database"/);
  assert.match(pageSource, /向量数据库测试/);
});

test("vector database page renders retrieval controls and results", () => {
  const path = new URL("./app/vector-database/page.tsx", import.meta.url);
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, "utf8");
  assert.match(source, /向量数据库测试/);
  assert.match(source, /query/);
  assert.match(source, /topK/);
  assert.match(source, /modelName/);
  assert.match(source, /result\.score/);
  assert.match(source, /fetch\("\/api\/rag\/search"/);
});
```

- [ ] **Step 2: 运行 Web 测试并确认 RED**

Run: `cd clients/web && bun run test`

Expected: FAIL，9.2 首页入口缺失，9.3 页面和代理不存在。

- [ ] **Step 3: 提交前端失败测试**

```powershell
git add clients/web/routing.test.mjs
git commit -m "补充 RAG 浏览器页面失败测试"
```

### Task 5: 完成 9.2 与 9.3 浏览器测试页

**Files:**
- Modify: `clients/web/app/page.tsx`
- Modify: `clients/web/app/rag-chunking/page.tsx`
- Modify: `clients/web/app/api/rag/chunk/route.ts`
- Create: `clients/web/app/vector-database/page.tsx`
- Create: `clients/web/app/api/rag/search/route.ts`
- Test: `clients/web/routing.test.mjs`

- [ ] **Step 1: 添加首页入口和两个稳定代理**

首页沿用现有链接样式加入 `/rag-chunking` 与 `/vector-database`。search 代理沿用 chunk 代理实现，只把后端路径改为 `/api/rag/search`；捕获网络异常时返回：

```ts
return NextResponse.json(
  { error: 'Backend RAG search request failed', detail: error instanceof Error ? error.message : String(error) },
  { status: 502 },
);
```

- [ ] **Step 2: 完成文档切分页**

页面包含返回工作台链接、普通/Parent-Child 分段按钮、`chunkSize`、`chunkOverlap`、文本区和结果区。普通模式显示 `Chunk {index}` 与 offset；Parent-Child 显示父子数量及 `Child {childIndex} -> Parent {parentIndex}`。按钮在加载或空文本时禁用，错误使用 `role="alert"`。

- [ ] **Step 3: 创建向量数据库页**

页面状态为 `query`、`topK`、`modelName`、`result`、`loading`、`error`。提交体为：

```ts
body: JSON.stringify({
  query,
  topK,
  modelName: modelName.trim() || undefined,
}),
```

响应区域显示 `dimension`、`count`，并逐条展示 `documentId`、`chunkIndex`、`modelName`、`result.score.toFixed(6)` 和内容。空结果显示“数据库中暂无可检索向量”，错误使用 `role="alert"`。

- [ ] **Step 4: 运行 Web 测试与类型检查并确认 GREEN**

Run: `cd clients/web && bun run test && bun run typecheck`

Expected: 全部 Web tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交前端实现**

```powershell
git add clients/web/app/page.tsx clients/web/app/rag-chunking/page.tsx clients/web/app/api/rag/chunk/route.ts clients/web/app/vector-database/page.tsx clients/web/app/api/rag/search/route.ts clients/web/routing.test.mjs
git commit -m "完成 RAG 切分与向量数据库测试页面"
```

### Task 6: 全量验证与交付复核

**Files:**
- Verify: `services/api/**`
- Verify: `clients/web/**`

- [ ] **Step 1: 运行格式与差异检查**

Run: `git diff --check`

Expected: exit 0，无 whitespace error。

- [ ] **Step 2: 运行后端验证**

Run: `cd services/api && bun run test -- chapter11-rag.spec.ts rag-controller.spec.ts && bun run typecheck && bun run build && bunx prisma validate`

Expected: 两个测试套件全部 PASS；类型检查、构建和 Prisma 校验 exit 0。

- [ ] **Step 3: 运行前端验证**

Run: `cd clients/web && bun run test && bun run typecheck && bun run build`

Expected: 全部 Web tests PASS；类型检查和生产构建 exit 0。

- [ ] **Step 4: 核对任务输出与工作区状态**

Run: `git status --short --branch`

Expected: 只保留用户原有且未纳入本功能的改动；9.2、9.3 要求文件均已提交。
