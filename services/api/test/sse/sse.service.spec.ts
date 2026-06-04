import { SseService } from '../../src/sse/sse.service';
import type { TaskEvent } from '../../src/sse/task-event.interface';

describe('SseService', () => {
  let service: SseService;

  beforeEach(() => {
    service = new SseService();
  });

  it('delivers emitted events to a subscribed user and fills id/createdAt', () => {
    const userId = 'user-1';
    const received: TaskEvent[] = [];
    const sub = service.subscribe(userId).subscribe((e) => received.push(e));

    service.emit(userId, {
      taskType: 'document_vectorize',
      taskId: 'doc-1',
      status: 'processing',
      message: '处理中',
    });

    expect(received).toHaveLength(1);
    expect(received[0].taskType).toBe('document_vectorize');
    expect(received[0].taskId).toBe('doc-1');
    expect(received[0].status).toBe('processing');
    expect(typeof received[0].id).toBe('string');
    expect(received[0].id.length).toBeGreaterThan(0);
    // createdAt 应为合法 ISO 8601
    expect(new Date(received[0].createdAt).toISOString()).toBe(received[0].createdAt);

    sub.unsubscribe();
  });

  it('shares one stream across multiple subscriptions of the same user (multicast)', () => {
    const userId = 'user-2';
    const a: TaskEvent[] = [];
    const b: TaskEvent[] = [];
    const subA = service.subscribe(userId).subscribe((e) => a.push(e));
    const subB = service.subscribe(userId).subscribe((e) => b.push(e));

    service.emit(userId, {
      taskType: 'document_vectorize',
      taskId: 'doc-1',
      status: 'done',
      message: '完成',
      metadata: { chunkCount: 3 },
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].metadata).toEqual({ chunkCount: 3 });

    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('silently drops events when the user has no active connection', () => {
    expect(() =>
      service.emit('ghost-user', {
        taskType: 'document_vectorize',
        taskId: 'doc-x',
        status: 'error',
        message: 'boom',
      }),
    ).not.toThrow();
  });

  it('completes and cleans up the stream on remove', () => {
    const userId = 'user-3';
    let completed = false;
    const received: TaskEvent[] = [];
    const sub = service.subscribe(userId).subscribe({
      next: (e) => received.push(e),
      complete: () => {
        completed = true;
      },
    });

    service.remove(userId);
    expect(completed).toBe(true);

    // remove 后再 emit 不应送达旧订阅者
    service.emit(userId, {
      taskType: 'document_vectorize',
      taskId: 'doc-1',
      status: 'done',
      message: '完成',
    });
    expect(received).toHaveLength(0);

    sub.unsubscribe();
  });
});
