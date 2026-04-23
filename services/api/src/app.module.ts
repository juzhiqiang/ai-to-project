import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
