import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../src/app.module';
import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';
import { VectorStoreService } from '../../src/llm/embedding/vector-store.service';

const ANALYSIS_RESULT = {
  conversationId: 'conv-1',
  input: '帮我判断一下能不能退，如果可以请告诉我下一步操作',
  report: '建议通过退货申请。',
  usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
  retrievedDocuments: [
    { chunkId: 'chunk-1', documentId: 'doc-1', content: '7 天无理由退货', score: 0.91 },
  ],
  orchestration: {
    mode: 'completed',
    clarificationQuestions: [],
    usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
    fallback: null,
    steps: [],
    report: '建议通过退货申请。',
  },
};

describe('AdvancedController', () => {
  const advancedAnalysisService = {
    analyze: jest.fn(async () => ANALYSIS_RESULT),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdvancedAnalysisService)
      .useValue(advancedAnalysisService)
      .overrideProvider(VectorStoreService)
      .useValue({ addDocuments: jest.fn(), similaritySearch: jest.fn() })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/advanced/analyze delegates to AdvancedAnalysisService.analyze', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/advanced/analyze')
      .set('x-user-id', 'user-1')
      .send({ conversationId: 'conv-1', input: '帮我判断一下能不能退，如果可以请告诉我下一步操作' })
      .expect(201)
      .expect(ANALYSIS_RESULT);

    expect(advancedAnalysisService.analyze).toHaveBeenCalledWith(
      'user-1',
      'conv-1',
      '帮我判断一下能不能退，如果可以请告诉我下一步操作',
    );
    await app.close();
  });
});
