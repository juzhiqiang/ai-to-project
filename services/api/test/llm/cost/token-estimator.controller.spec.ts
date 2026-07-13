import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../../src/app.module';
import { VectorStoreService } from '../../../src/llm/embedding/vector-store.service';

describe('TokenEstimatorController', () => {
  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VectorStoreService)
      .useValue({ addDocuments: jest.fn(), similaritySearch: jest.fn() })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/cost/token-estimate calculates graph node cost through the API', async () => {
    const app = await createApp();

    const response = await request(app.getHttpServer())
      .post('/api/cost/token-estimate')
      .send({
        nodeName: 'supervisor',
        modelName: 'gpt-4o-mini',
        systemPrompt: '你是需求分析 Supervisor。',
        toolSchemas: [
          {
            name: 'handoff_to_functional_expert',
            description: 'Transfer analysis to the functional expert.',
          },
        ],
        messages: ['用户需要新增审批流。'],
        outputText: '启用 functional expert。',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        nodeName: 'supervisor',
        modelName: 'gpt-4o-mini',
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        estimatedCostUsd: expect.any(Number),
        pricing: {
          input: 0.15,
          output: 0.6,
          cachedInput: 0.075,
        },
      }),
    );
    expect(response.body.inputTokens).toBeGreaterThan(0);
    expect(response.body.outputTokens).toBeGreaterThan(0);

    await app.close();
  });
});
