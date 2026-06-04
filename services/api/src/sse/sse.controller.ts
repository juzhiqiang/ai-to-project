import { Controller, Sse, UseGuards, Req, type MessageEvent } from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { SseService } from './sse.service';
import { UserIdGuard } from '../auth/user-id.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(UserIdGuard)
@Controller('api')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  /**
   * SSE 任务推送通道。
   * NestJS 的 @Sse() 会自动设置 Content-Type: text/event-stream。
   * 前端：const es = new EventSource('/api/sse', ...)，监听 onmessage。
   */
  @Sse('sse')
  sse(@CurrentUser() userId: string, @Req() req: Request): Observable<MessageEvent> {
    const stream$ = this.sseService.subscribe(userId);

    // 连接断开时清理该用户的事件流
    req.on('close', () => {
      this.sseService.remove(userId);
    });

    // 将 TaskEvent 包装为 SSE MessageEvent；data 为对象时 NestJS 会自动 JSON.stringify
    return stream$.pipe(
      map((event): MessageEvent => ({
        id: event.id,
        data: event,
      })),
    );
  }
}
