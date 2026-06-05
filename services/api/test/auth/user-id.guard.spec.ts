import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserIdGuard } from '../../src/auth/user-id.guard';
import { encodeDevAuthToken } from '../../src/auth/dev-auth-token';

function createContext(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; userId?: string } = { headers };

  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext,
  };
}

describe('UserIdGuard', () => {
  it('keeps supporting x-user-id', () => {
    const { context, request } = createContext({ 'x-user-id': 'user-1' });

    expect(new UserIdGuard().canActivate(context)).toBe(true);
    expect(request.userId).toBe('user-1');
  });

  it('accepts Authorization Bearer tokens from /api/auth/login', () => {
    const token = encodeDevAuthToken({ userId: 'admin-test-com', email: 'admin@test.com' });
    const { context, request } = createContext({
      authorization: `Bearer ${token}`,
    });

    expect(new UserIdGuard().canActivate(context)).toBe(true);
    expect(request.userId).toBe('admin-test-com');
  });

  it('rejects missing or invalid identity headers', () => {
    const { context } = createContext({ authorization: 'Bearer not-a-valid-token' });

    expect(() => new UserIdGuard().canActivate(context)).toThrow(UnauthorizedException);
  });
});
