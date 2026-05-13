import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AdvancedModule } from './llm/advanced.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [LlmModule, AdvancedModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
