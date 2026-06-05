import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthModule } from '../../src/auth/auth.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { decodeDevAuthToken } from '../../src/auth/dev-auth-token';

describe('AuthController', () => {
  const prisma = {
    user: {
      upsert: jest.fn(async ({ create }) => ({
        id: create.id,
        email: create.email,
        name: create.name,
      })),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    return app;
  }

  it('POST /api/auth/login returns a bearer token for the test admin user', async () => {
    const app = await createApp();

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: '123456' })
      .expect(201);

    expect(response.body).toEqual({
      tokenType: 'Bearer',
      accessToken: expect.any(String),
      user: {
        id: 'admin-test-com',
        email: 'admin@test.com',
        name: 'admin',
      },
    });
    expect(decodeDevAuthToken(response.body.accessToken)).toEqual({
      userId: 'admin-test-com',
      email: 'admin@test.com',
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: 'admin@test.com' },
      update: { name: 'admin' },
      create: {
        id: 'admin-test-com',
        email: 'admin@test.com',
        name: 'admin',
      },
    });

    await app.close();
  });

  it('rejects invalid credentials', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' })
      .expect(401);

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});
