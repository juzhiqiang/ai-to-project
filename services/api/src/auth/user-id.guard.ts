import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 开发阶段简易 Guard：从 x-user-id 请求头中提取用户 ID 并写入 request.userId。
 * 生产环境应替换为真实 JWT 验证（解析 Bearer token 中的 sub 字段）。
 */
@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const userId = request.headers['x-user-id'];

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    request.userId = userId.trim();
    return true;
  }
}
