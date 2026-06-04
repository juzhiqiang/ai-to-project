import { Global, Module } from '@nestjs/common';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';

/**
 * 全局 SSE 模块。
 * 标记为 @Global() 后，任何模块的 Provider（如 ChunkService）
 * 都可直接注入 SseService，无需重复 import。
 */
@Global()
@Module({
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
