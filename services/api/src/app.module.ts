import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AdvancedModule } from './llm/advanced.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConversationModule } from './conversation/conversation.module';
import { UserModule } from './user/user.module';
import { DocumentModule } from './document/document.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { SseModule } from './sse/sse.module';

@Module({
  imports: [PrismaModule, LlmModule, AdvancedModule, ConversationModule, UserModule, DocumentModule, EmbeddingModule, SseModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
