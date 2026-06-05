import { Module } from '@nestjs/common';
import { AgentsController } from './agents/agents.controller';
import { OrchestratorService } from './agents/orchestrator.service';
import { EmbeddingController } from './embedding/embedding.controller';
import { EmbeddingService } from './embedding/embedding.service';
import { VectorStoreService } from './embedding/vector-store.service';
import { FilesController } from './filesystem/files.controller';
import { FilesystemService } from './filesystem/filesystem.service';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { MemoryController } from './memory/memory.controller';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { CHAT_MODEL_FACTORY, createChatModel } from './model.factory';
import { RequirementService } from './requirement.service';
import { UIProtocolModule } from './ui-protocol/ui-protocol.module';

@Module({
  imports: [UIProtocolModule],
  controllers: [LlmController, MemoryController, FilesController, EmbeddingController, AgentsController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    EmbeddingService,
    VectorStoreService,
    OrchestratorService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    EmbeddingService,
    VectorStoreService,
    OrchestratorService,
  ],
})
export class LlmModule { }
