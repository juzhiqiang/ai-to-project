import { Module } from '@nestjs/common';
import { CHAT_MODEL_FACTORY, createChatModel } from '../model.factory';
import { UIActionService } from './ui-action.service';
import { UIChatController } from './ui-chat.controller';
import { UIResponseService } from './ui-response.service';

@Module({
  controllers: [UIChatController],
  providers: [
    UIActionService,
    UIResponseService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [UIActionService, UIResponseService],
})
export class UIProtocolModule {}
