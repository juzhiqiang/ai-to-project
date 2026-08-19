import { readdir } from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const USER_ID = process.env.RAG_SEED_USER_ID ?? 'dev-user';
const DOCUMENT_DIR = path.resolve(import.meta.dir, '../rag/test-documents');
const POLL_INTERVAL_MS = 1_500;
const PROCESS_TIMEOUT_MS = 180_000;

type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ApiDocument {
  id: string;
  originalName: string;
  status: DocumentStatus;
  chunkCount: number;
}

async function api(pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-user-id', USER_ID);
  const response = await fetch(`${API_BASE}${pathname}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function listDocuments(): Promise<ApiDocument[]> {
  return (await api('/api/documents')).json() as Promise<ApiDocument[]>;
}

async function upload(filePath: string, fileName: string): Promise<ApiDocument> {
  const form = new FormData();
  form.append('file', Bun.file(filePath), fileName);
  return (await api('/api/documents/upload', { method: 'POST', body: form })).json() as Promise<ApiDocument>;
}

async function triggerProcess(documentId: string): Promise<void> {
  await api(`/api/documents/${documentId}/process`, { method: 'POST' });
}

async function waitUntilCompleted(documentId: string): Promise<ApiDocument> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PROCESS_TIMEOUT_MS) {
    const document = (await api(`/api/documents/${documentId}`)).json() as Promise<ApiDocument>;
    const current = await document;
    if (current.status === 'completed') return current;
    if (current.status === 'failed') throw new Error(`${current.originalName} processing failed`);
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for document ${documentId}`);
}

async function seedFile(fileName: string): Promise<ApiDocument> {
  const filePath = path.join(DOCUMENT_DIR, fileName);
  let existing = (await listDocuments()).find((doc) => doc.originalName === fileName);

  if (existing?.status === 'completed') {
    console.log(`skip completed: ${fileName} (${existing.chunkCount} chunks)`);
    return existing;
  }

  if (existing?.status === 'failed') {
    await api(`/api/documents/${existing.id}`, { method: 'DELETE' });
    existing = undefined;
  }

  const document = existing ?? (await upload(filePath, fileName));
  if (document.status === 'pending') {
    console.log(`process: ${fileName}`);
    await triggerProcess(document.id);
  } else {
    console.log(`wait existing ${document.status}: ${fileName}`);
  }

  const completed = await waitUntilCompleted(document.id);
  console.log(`completed: ${fileName} (${completed.chunkCount} chunks)`);
  return completed;
}

async function main(): Promise<void> {
  const fileNames = (await readdir(DOCUMENT_DIR))
    .filter((name) => name.endsWith('.md'))
    .sort();

  if (fileNames.length < 12) throw new Error(`Expected at least 12 markdown files, found ${fileNames.length}`);

  const completed: ApiDocument[] = [];
  for (const fileName of fileNames) completed.push(await seedFile(fileName));

  const totalChunks = completed.reduce((sum, document) => sum + document.chunkCount, 0);
  console.log(JSON.stringify({ userId: USER_ID, documents: completed.length, totalChunks }, null, 2));
}

await main();
