import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ConversationController } from '../../src/conversation/conversation.controller';
import { ConversationService } from '../../src/conversation/conversation.service';
import { MessageService } from '../../src/conversation/message.service';
import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';

const USER_ID = 'user-policy-001';
const CONVERSATION_ID = 'conv-policy-001';
const TURN_INPUTS = [
  '我想咨询退货。',
  '订单号是 EC20240315001。',
  '昨天收到，商品还没拆封。',
  '那我这个订单能不能退？退款怎么处理？',
];

describe('ConversationController', () => {
  const conversationService = {
    findById: jest.fn(async () => ({ id: CONVERSATION_ID, userId: USER_ID })),
    create: jest.fn(),
    findByUser: jest.fn(),
    delete: jest.fn(),
  };
  const messageService = {
    getHistory: jest.fn(),
  };
  const advancedAnalysisService = {
    analyze: jest.fn(async (_userId: string, conversationId: string, input: string) => ({
      conversationId,
      input,
      report:
        input === TURN_INPUTS[3]
          ? '根据 return-policy.md 和 refund-policy.md，签收 7 天内未拆封可退货，退款审核后原路退回。'
          : '请继续补充退货信息。',
      usedAgents:
        input === TURN_INPUTS[3]
          ? ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent']
          : ['extractAgent'],
      retrievedDocuments:
        input === TURN_INPUTS[3]
          ? [
              {
                chunkId: 'chunk-return-policy',
                documentId: 'doc-return-policy',
                content: 'return-policy.md：签收 7 天内且商品未拆封可申请退货。',
                score: 0.94,
              },
              {
                chunkId: 'chunk-refund-policy',
                documentId: 'doc-refund-policy',
                content: 'refund-policy.md：退货审核通过后退款原路退回。',
                score: 0.89,
              },
            ]
          : [],
      orchestration: {
        mode: input === TURN_INPUTS[3] ? 'completed' : 'clarification',
        clarificationQuestions: [],
        usedAgents: [],
        fallback: null,
        steps: [],
        report: '',
      },
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: ConversationService, useValue: conversationService },
        { provide: MessageService, useValue: messageService },
        { provide: AdvancedAnalysisService, useValue: advancedAnalysisService },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('runs four chat turns through the unified RAG + multi-agent route and returns retrieved policy documents', async () => {
    const app = await createApp();

    for (const input of TURN_INPUTS.slice(0, 3)) {
      await request(app.getHttpServer())
        .post(`/api/conversations/${CONVERSATION_ID}/chat`)
        .set('x-user-id', USER_ID)
        .send({ input })
        .expect(201)
        .expect((response) => {
          expect(response.body).toMatchObject({
            conversationId: CONVERSATION_ID,
            report: '请继续补充退货信息。',
            usedAgents: ['extractAgent'],
            retrievedDocuments: [],
          });
        });
    }

    await request(app.getHttpServer())
      .post(`/api/conversations/${CONVERSATION_ID}/chat`)
      .set('x-user-id', USER_ID)
      .send({ input: TURN_INPUTS[3] })
      .expect(201)
      .expect((response) => {
        expect(response.body.report).toContain('return-policy.md');
        expect(response.body.report).toContain('refund-policy.md');
        expect(response.body.usedAgents).toEqual([
          'extractAgent',
          'policyCheckAgent',
          'riskReviewAgent',
          'qaAgent',
          'summaryAgent',
        ]);
        expect(response.body.retrievedDocuments).toEqual([
          expect.objectContaining({
            documentId: 'doc-return-policy',
            content: expect.stringContaining('return-policy.md'),
          }),
          expect.objectContaining({
            documentId: 'doc-refund-policy',
            content: expect.stringContaining('refund-policy.md'),
          }),
        ]);
      });

    expect(conversationService.findById).toHaveBeenCalledTimes(4);
    expect(advancedAnalysisService.analyze).toHaveBeenNthCalledWith(
      4,
      USER_ID,
      CONVERSATION_ID,
      TURN_INPUTS[3],
    );

    await app.close();
  });
});
