import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../../../src/app.module';
import { VectorStoreService } from '../../../src/llm/embedding/vector-store.service';

const SEARCH_RESULT = [
  {
    content: '退货政策：签收 7 天内且商品完好可退货。',
    metadata: { source: 'policies/return-policy.md' },
  },
];

describe('EmbeddingController', () => {
  const vectorStoreService = {
    addDocuments: jest.fn(async () => ({ added: 1 })),
    similaritySearch: jest.fn(async () => SEARCH_RESULT),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VectorStoreService)
      .useValue(vectorStoreService)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/embedding/store delegates documents to VectorStoreService', async () => {
    const app = await createApp();
    const documents = [{ content: '退货政策：7 天内可退。', metadata: { source: 'manual' } }];

    await request(app.getHttpServer()).post('/api/embedding/store').send({ documents }).expect(201).expect({ added: 1 });

    expect(vectorStoreService.addDocuments).toHaveBeenCalledWith(documents);
    await app.close();
  });

  it('POST /api/embedding/search returns similar documents from VectorStoreService', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/embedding/search')
      .send({ query: '退货政策', topK: 1 })
      .expect(201)
      .expect(SEARCH_RESULT);

    expect(vectorStoreService.similaritySearch).toHaveBeenCalledWith('退货政策', 1);
    await app.close();
  });
});
