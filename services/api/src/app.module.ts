import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AdvancedModule } from './llm/advanced.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [PrismaModule, LlmModule, AdvancedModule, ConversationModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
