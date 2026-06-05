import { Test } from '@nestjs/testing';
import request = require('supertest');
import { UIActionService } from '../../../src/llm/ui-protocol/ui-action.service';
import { UIChatController } from '../../../src/llm/ui-protocol/ui-chat.controller';
import { UIResponseService } from '../../../src/llm/ui-protocol/ui-response.service';

const UI_RESPONSE = {
  message: '请选择需求类型',
  components: [
    {
      type: 'selection',
      id: 'requirement-type',
      title: '选择需求类型',
      mode: 'single',
      options: [{ label: '新功能', value: 'feature' }],
    },
  ],
};

describe('UIChatController', () => {
  const uiResponseService = {
    generateUIResponse: jest.fn(async () => UI_RESPONSE),
  };
  const uiActionService = {
    handleAction: jest.fn(async () => ({
      message: '请确认提交',
      components: [{ type: 'confirmation', id: 'confirm', title: '确认提交', summary: ['需求：新功能'] }],
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [UIChatController],
      providers: [
        { provide: UIResponseService, useValue: uiResponseService },
        { provide: UIActionService, useValue: uiActionService },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/ui-chat/chat returns an AI UI response', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/ui-chat/chat')
      .send({ sessionId: 'session-1', input: '我要提一个新需求' })
      .expect(201)
      .expect(UI_RESPONSE);

    expect(uiResponseService.generateUIResponse).toHaveBeenCalledWith(
      '我要提一个新需求',
      undefined,
      { sessionId: 'session-1' },
    );
    await app.close();
  });

  it('POST /api/ui-chat/action handles UI actions', async () => {
    const app = await createApp();
    const action = { type: 'form_submit', componentId: 'requirement-form', value: { title: '优化退款流程' } };

    await request(app.getHttpServer())
      .post('/api/ui-chat/action')
      .send({ sessionId: 'session-1', action })
      .expect(201)
      .expect({
        message: '请确认提交',
        components: [{ type: 'confirmation', id: 'confirm', title: '确认提交', summary: ['需求：新功能'] }],
      });

    expect(uiActionService.handleAction).toHaveBeenCalledWith(action, { sessionId: 'session-1' });
    await app.close();
  });
});
