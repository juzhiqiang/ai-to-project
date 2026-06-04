import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { randomUUID } from 'crypto';
import type { TaskEvent } from './task-event.interface';

/**
 * SSE 推送服务。
 *
 * 为每个用户维护一个 Subject，前端通过 SseController 订阅，
 * 后端任务（如向量化）通过 emit() 推送状态事件。
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  /** userId -> 该用户的事件流 */
  private readonly streams = new Map<string, Subject<TaskEvent>>();

  /**
   * 前端连接时调用，返回该用户的事件流。
   * 同一用户的多个连接共享同一个 Subject（多播）。
   */
  subscribe(userId: string): Observable<TaskEvent> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<TaskEvent>();
      this.streams.set(userId, subject);
      this.logger.log(`SSE 连接建立: userId=${userId}`);
    }
    return subject.asObservable();
  }

  /**
   * 后端任务推送事件。id 与 createdAt 由本方法自动生成，调用方无需关心。
   * 若该用户当前没有活跃连接，事件被静默丢弃。
   */
  emit(userId: string, event: Omit<TaskEvent, 'id' | 'createdAt'>): void {
    const subject = this.streams.get(userId);
    if (!subject) {
      this.logger.debug(`无活跃 SSE 连接，丢弃事件: userId=${userId} ${event.taskType}/${event.status}`);
      return;
    }

    const fullEvent: TaskEvent = {
      ...event,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    subject.next(fullEvent);
  }

  /**
   * 连接断开时调用，完成并清理该用户的事件流。
   */
  remove(userId: string): void {
    const subject = this.streams.get(userId);
    if (subject) {
      subject.complete();
      this.streams.delete(userId);
      this.logger.log(`SSE 连接关闭: userId=${userId}`);
    }
  }
}
