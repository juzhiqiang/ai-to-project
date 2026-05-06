import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../../src/app.module';
import { RunnableMemoryService } from '../../../src/llm/memory/runnable-memory.service';

const CHAT_RESULT = {
  sessionId: 's1',
  content: '这个订单需要结合售后规则判断',
};
const HISTORY_RESULT = [
  { type: 'human', content: '我买的蓝牙耳机降噪效果不好，想退货' },
  { type: 'ai', content: '请提供订单号' },
];

describe('MemoryController', () => {
  const memoryService = {
    chat: jest.fn(async () => CHAT_RESULT),
    getHistory: jest.fn(async () => HISTORY_RESULT),
    clearSession: jest.fn(async () => undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RunnableMemoryService)
      .useValue(memoryService)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/memory/chat delegates to RunnableMemoryService.chat', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/memory/chat')
      .send({ sessionId: 's1', input: '帮我判断一下这个订单能不能退' })
      .expect(201)
      .expect(CHAT_RESULT);

    expect(memoryService.chat).toHaveBeenCalledWith('s1', '帮我判断一下这个订单能不能退');
    await app.close();
  });

  it('GET /api/memory/history delegates to RunnableMemoryService.getHistory', async () => {
    const app = await createApp();

    await request(app.getHttpServer()).get('/api/memory/history').query({ sessionId: 's1' }).expect(200).expect({
      sessionId: 's1',
      messages: HISTORY_RESULT,
    });

    expect(memoryService.getHistory).toHaveBeenCalledWith('s1');
    await app.close();
  });

  it('DELETE /api/memory/clear delegates to RunnableMemoryService.clearSession', async () => {
    const app = await createApp();

    await request(app.getHttpServer()).delete('/api/memory/clear').query({ sessionId: 's1' }).expect(200).expect({
      sessionId: 's1',
      cleared: true,
    });

    expect(memoryService.clearSession).toHaveBeenCalledWith('s1');
    await app.close();
  });
});
