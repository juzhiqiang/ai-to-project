import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DocumentController } from '../../src/document/document.controller';
import { DocumentService } from '../../src/document/document.service';
import { ChunkService } from '../../src/document/chunk.service';

describe('DocumentController', () => {
  const documentService = {
    upload: jest.fn(async (_userId, file: Express.Multer.File) => ({
      id: 'doc-md',
      originalName: file.originalname,
      mimeType: file.mimetype,
      status: 'pending',
    })),
    findById: jest.fn(),
    findByUser: jest.fn(),
    delete: jest.fn(),
  };
  const chunkService = {
    chunkDocument: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        { provide: DocumentService, useValue: documentService },
        { provide: ChunkService, useValue: chunkService },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('accepts markdown uploads even when curl sends application/octet-stream', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('x-user-id', 'user-1')
      .attach('file', Buffer.from('退货政策：7 天内未拆封可退货。', 'utf8'), {
        filename: 'return-policy.md',
        contentType: 'application/octet-stream',
      })
      .expect(201)
      .expect({
        id: 'doc-md',
        originalName: 'return-policy.md',
        mimeType: 'text/markdown',
        status: 'pending',
      });

    expect(documentService.upload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        originalname: 'return-policy.md',
        mimetype: 'text/markdown',
      }),
    );
    await app.close();
  });
});
