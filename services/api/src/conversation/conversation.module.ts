import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationChatService } from './conversation-chat.service';
import { MessageService } from './message.service';
import { CHAT_MODEL_FACTORY, createChatModel } from '../llm/model.factory';
import { AdvancedModule } from '../llm/advanced.module';

@Module({
  // 引入 AdvancedModule，使 chat 路由可调用 AdvancedAnalysisService 的完整分析链路
  imports: [AdvancedModule],
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
