import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { decodeDevAuthToken } from './dev-auth-token';

/**
 * 开发阶段简易 Guard：从 x-user-id 请求头中提取用户 ID 并写入 request.userId。
 * 生产环境应替换为真实 JWT 验证（解析 Bearer token 中的 sub 字段）。
 */
@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const headerUserId = request.headers['x-user-id'];

    if (typeof headerUserId === 'string' && headerUserId.trim() !== '') {
      request.userId = headerUserId.trim();
      return true;
    }

    const bearerUserId = getBearerUserId(request.headers.authorization);

    if (bearerUserId) {
      request.userId = bearerUserId;
      return true;
    }

    throw new UnauthorizedException('Missing x-user-id header or Authorization bearer token');
  }
}

function getBearerUserId(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  return decodeDevAuthToken(match[1])?.userId ?? null;
}
