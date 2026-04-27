import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { CHAT_MODEL_FACTORY, createChatModel } from './model.factory';
import { RequirementService } from './requirement.service';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    RequirementService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [LlmService, RequirementService],
})
export class LlmModule { }
