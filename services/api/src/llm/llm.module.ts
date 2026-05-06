import { Module } from '@nestjs/common';
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

@Module({
  controllers: [LlmController, MemoryController, FilesController, EmbeddingController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    EmbeddingService,
    VectorStoreService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [LlmService, RequirementService, RunnableMemoryService, FilesystemService, EmbeddingService, VectorStoreService],
})
export class LlmModule { }
