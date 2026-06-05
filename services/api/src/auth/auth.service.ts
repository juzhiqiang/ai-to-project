import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encodeDevAuthToken } from './dev-auth-token';

export interface LoginDto {
  email: string;
  password: string;
}

const DEV_ADMIN_EMAIL = 'admin@test.com';
const DEV_ADMIN_PASSWORD = '123456';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(body: LoginDto) {
    if (body.email !== DEV_ADMIN_EMAIL || body.password !== DEV_ADMIN_PASSWORD) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.upsert({
      where: { email: body.email },
      update: { name: 'admin' },
      create: {
        id: userIdFromEmail(body.email),
        email: body.email,
        name: 'admin',
      },
    });

    return {
      tokenType: 'Bearer',
      accessToken: encodeDevAuthToken({ userId: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}

function userIdFromEmail(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
