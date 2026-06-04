/**
 * SSE 任务事件。
 * 后端异步任务（如文档向量化）通过 SseService 推送此结构给前端。
 */
export interface TaskEvent {
  /** 事件唯一 ID（uuid） */
  id: string;
  /** 任务类型，如 'document_vectorize' */
  taskType: string;
  /** 业务 ID，如 documentId */
  taskId: string;
  /** 任务状态 */
  status: 'processing' | 'done' | 'error';
  /** 人类可读的描述信息 */
  message: string;
  /** 附加数据，如 { chunkCount } */
  metadata?: Record<string, unknown>;
  /** 事件创建时间（ISO 8601） */
  createdAt: string;
}
