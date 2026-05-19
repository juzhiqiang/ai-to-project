import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationChatService } from './conversation-chat.service';
import { MessageService } from './message.service';
import { CHAT_MODEL_FACTORY, createChatModel } from '../llm/model.factory';

@Module({
  controllers: [ConversationController],
  providers: [
    ConversationService,
    MessageService,
    ConversationChatService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [ConversationService, MessageService],
})
export class ConversationModule {}
