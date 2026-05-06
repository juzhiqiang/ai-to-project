import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { RequirementService } from '../src/llm/requirement.service';

const INPUT = '用户注册时必须绑定手机号，密码至少8位';
const REQUIREMENT_RESULT = {
  action: ['绑定手机号'],
  constraints: ['必须绑定手机号', '密码至少8位'],
  entities: ['用户注册', '手机号', '密码'],
};

describe('Requirement extraction endpoint', () => {
  let app: INestApplication;
  const requirementService = {
    extract: jest.fn(async () => REQUIREMENT_RESULT),
  };

  beforeEach(async () => {
    requirementService.extract.mockClear();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RequirementService)
      .useValue(requirementService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /requirement/extract delegates to RequirementService.extract', async () => {
    await request(app.getHttpServer())
      .post('/requirement/extract')
      .send({ input: INPUT })
      .expect(201)
      .expect(REQUIREMENT_RESULT);

    expect(requirementService.extract).toHaveBeenCalledWith(INPUT);
  });
});
