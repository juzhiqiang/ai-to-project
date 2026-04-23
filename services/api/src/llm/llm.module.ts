import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { CHAT_MODEL_FACTORY, createChatModel } from './model.factory';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
})
export class LlmModule {}
