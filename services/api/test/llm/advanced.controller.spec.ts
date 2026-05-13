import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../src/app.module';
import { AdvancedAnalysisService } from '../../src/llm/advanced-analysis.service';
import { VectorStoreService } from '../../src/llm/embedding/vector-store.service';

const ANALYSIS_RESULT = {
  sessionId: 's1',
  input: '帮我判断一下能不能退，如果可以请告诉我下一步操作',
  context: '历史上下文',
  orchestration: {
    mode: 'completed',
    clarificationQuestions: [],
    usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
    fallback: null,
    steps: [],
    report: '建议通过退货申请。',
  },
  ticket: { path: 'tickets/EC20240315001-analysis.md', written: true },
  memory: { appended: true },
  report: '建议通过退货申请。',
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
      .send({ sessionId: 's1', input: '帮我判断一下能不能退，如果可以请告诉我下一步操作' })
      .expect(201)
      .expect(ANALYSIS_RESULT);

    expect(advancedAnalysisService.analyze).toHaveBeenCalledWith(
      's1',
      '帮我判断一下能不能退，如果可以请告诉我下一步操作',
    );
    await app.close();
  });
});
