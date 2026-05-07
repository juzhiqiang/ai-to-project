import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../../src/app.module';
import { OrchestratorService } from '../../../src/llm/agents/orchestrator.service';
import { VectorStoreService } from '../../../src/llm/embedding/vector-store.service';

const ORCHESTRATE_RESULT = {
  mode: 'completed',
  clarificationQuestions: [],
  usedAgents: ['extractAgent', 'policyCheckAgent', 'riskReviewAgent', 'qaAgent', 'summaryAgent'],
  fallback: null,
  steps: [],
  report: '建议通过退货申请。',
};

describe('AgentsController', () => {
  const orchestratorService = {
    orchestrate: jest.fn(async () => ORCHESTRATE_RESULT),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OrchestratorService)
      .useValue(orchestratorService)
      .overrideProvider(VectorStoreService)
      .useValue({ addDocuments: jest.fn(), similaritySearch: jest.fn() })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/agents/orchestrate delegates to OrchestratorService.orchestrate', async () => {
    const app = await createApp();
    const input = '我买的蓝牙耳机降噪效果不好，订单号 EC20240315001，昨天收到还没拆封，想退货';

    await request(app.getHttpServer()).post('/api/agents/orchestrate').send({ input }).expect(201).expect(ORCHESTRATE_RESULT);

    expect(orchestratorService.orchestrate).toHaveBeenCalledWith(input);
    await app.close();
  });
});
