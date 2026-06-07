import { Test } from '@nestjs/testing';
import request = require('supertest');
import { UIActionHandler } from '../../../src/llm/ui-protocol/ui-action.handler';
import { UIApiController } from '../../../src/llm/ui-protocol/ui-api.controller';

describe('UIApiController', () => {
  const handler = {
    handle: jest.fn(async () => ({
      message: '请填写需求详情',
      components: [{ type: 'form', id: 'requirement-detail-form', title: '填写需求详情', fields: [] }],
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [UIApiController],
      providers: [{ provide: UIActionHandler, useValue: handler }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/ui-api/action dispatches actions through the handler', async () => {
    const app = await createApp();
    const action = {
      type: 'selection',
      componentType: 'selection',
      componentId: 'requirement-type',
      payload: 'functional',
    };

    await request(app.getHttpServer())
      .post('/api/ui-api/action')
      .send({ sessionId: 'session-api', action })
      .expect(201)
      .expect({
        message: '请填写需求详情',
        components: [{ type: 'form', id: 'requirement-detail-form', title: '填写需求详情', fields: [] }],
      });

    expect(handler.handle).toHaveBeenCalledWith(action, { sessionId: 'session-api' });
    await app.close();
  });
});
