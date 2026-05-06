import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { EmbeddingService } from './embedding.service';

export const VECTOR_STORE_RUNTIME = Symbol('VECTOR_STORE_RUNTIME');
export const INITIAL_DOCUMENT_PATHS = [
  'policies/return-policy.md',
  'policies/refund-policy.md',
  'faq/after-sale-faq.md',
];

const WORKSPACE_DIR = resolve(process.cwd(), 'workspace');

export interface VectorStoreDocumentInput {
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorStoreDocumentResult {
  content: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly vectorStore: MemoryVectorStore;
  private initialDocumentsLoaded = false;

  constructor(
    private readonly embeddingService: EmbeddingService,
    @Optional()
    @Inject(VECTOR_STORE_RUNTIME)
    vectorStore?: MemoryVectorStore,
  ) {
    this.vectorStore = vectorStore ?? new MemoryVectorStore(this.embeddingService);
  }

  async onModuleInit() {
    return this.loadInitialDocuments();
  }

  async addDocuments(docs: VectorStoreDocumentInput[]) {
    if (docs.length === 0) {
      return { added: 0 };
    }

    await this.vectorStore.addDocuments(
      docs.map(
        (doc) =>
          new Document({
            pageContent: doc.content,
            metadata: doc.metadata ?? {},
          }),
      ),
    );

    return { added: docs.length };
  }

  async similaritySearch(query: string, topK: number): Promise<VectorStoreDocumentResult[]> {
    const documents = await this.vectorStore.similaritySearch(query, topK);

    return documents.map((doc) => ({
      content: doc.pageContent,
      metadata: doc.metadata ?? {},
    }));
  }

  private async loadInitialDocuments() {
    if (this.initialDocumentsLoaded) {
      return { added: 0 };
    }

    const documents: VectorStoreDocumentInput[] = [];

    for (const path of INITIAL_DOCUMENT_PATHS) {
      const content = await readInitialDocument(path);

      if (content) {
        documents.push({
          content,
          metadata: { source: path },
        });
      }
    }

    this.initialDocumentsLoaded = true;
    return this.addDocuments(documents);
  }
}

async function readInitialDocument(path: string) {
  try {
    return await readFile(safeWorkspacePath(path), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function safeWorkspacePath(workspaceRelativePath: string) {
  if (isAbsolute(workspaceRelativePath)) {
    throw new Error('Initial document path must be relative to workspace.');
  }

  const targetPath = resolve(WORKSPACE_DIR, workspaceRelativePath);
  const relativePath = relative(WORKSPACE_DIR, targetPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Initial document path escapes workspace.');
  }

  return targetPath;
}
