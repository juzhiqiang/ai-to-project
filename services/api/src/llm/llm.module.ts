import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { MemoryController } from './memory/memory.controller';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { CHAT_MODEL_FACTORY, createChatModel } from './model.factory';
import { RequirementService } from './requirement.service';

@Module({
  controllers: [LlmController, MemoryController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [LlmService, RequirementService, RunnableMemoryService],
})
export class LlmModule { }
