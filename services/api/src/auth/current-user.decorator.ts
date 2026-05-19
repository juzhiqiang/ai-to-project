import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 从请求中提取当前用户 ID。
 * 由 UserIdGuard 写入 request.userId。
 * 后续接入真实 JWT 后只需修改 guard，此装饰器无需改动。
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { userId?: string }>();
  return request.userId ?? '';
});
