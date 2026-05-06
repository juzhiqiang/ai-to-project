import { Module } from '@nestjs/common';
import { FilesController } from './filesystem/files.controller';
import { FilesystemService } from './filesystem/filesystem.service';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { MemoryController } from './memory/memory.controller';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { CHAT_MODEL_FACTORY, createChatModel } from './model.factory';
import { RequirementService } from './requirement.service';

@Module({
  controllers: [LlmController, MemoryController, FilesController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [LlmService, RequirementService, RunnableMemoryService, FilesystemService],
})
export class LlmModule { }
