import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../../src/app.module';
import { FilesystemService } from '../../../src/llm/filesystem/filesystem.service';

const FILE_CHAT_RESULT = {
  content: '已写入退货判断工单。',
  toolCalls: [{ id: 'call_ticket', name: 'write_file', args: { path: 'tickets/EC20240315001-analysis.md' } }],
  toolResults: [{ id: 'call_ticket', name: 'write_file', content: '{"written":true}' }],
};

describe('FilesController', () => {
  const filesystemService = {
    fileChat: jest.fn(async () => FILE_CHAT_RESULT),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FilesystemService)
      .useValue(filesystemService)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/files/file-chat delegates to FilesystemService.fileChat', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/files/file-chat')
      .send({ input: '把退货判断结论写入 tickets/EC20240315001-analysis.md' })
      .expect(201)
      .expect(FILE_CHAT_RESULT);

    expect(filesystemService.fileChat).toHaveBeenCalledWith('把退货判断结论写入 tickets/EC20240315001-analysis.md');
    await app.close();
  });
});
