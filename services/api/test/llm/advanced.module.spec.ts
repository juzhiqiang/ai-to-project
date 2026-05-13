import { Test } from '@nestjs/testing';
import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';
import { AdvancedModule } from '../../src/llm/advanced.module';
import { OrchestratorService } from '../../src/llm/agents/orchestrator.service';
import { EmbeddingService } from '../../src/llm/embedding/embedding.service';
import { VectorStoreService } from '../../src/llm/embedding/vector-store.service';
import { FilesystemService } from '../../src/llm/filesystem/filesystem.service';
import { RunnableMemoryService } from '../../src/llm/memory/runnable-memory.service';

describe('AdvancedModule', () => {
  it('registers the unified fourth-chapter services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdvancedModule],
    })
      .overrideProvider(VectorStoreService)
      .useValue({ addDocuments: jest.fn(), similaritySearch: jest.fn() })
      .compile();

    expect(moduleRef.get(RunnableMemoryService)).toBeDefined();
    expect(moduleRef.get(EmbeddingService)).toBeDefined();
    expect(moduleRef.get(VectorStoreService)).toBeDefined();
    expect(moduleRef.get(FilesystemService)).toBeDefined();
    expect(moduleRef.get(OrchestratorService)).toBeDefined();
    expect(moduleRef.get(AdvancedAnalysisService)).toBeDefined();
  });
});
