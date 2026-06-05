export interface DevAuthPayload {
  userId: string;
  email: string;
}

const TOKEN_PREFIX = 'dev.';

export function encodeDevAuthToken(payload: DevAuthPayload): string {
  return `${TOKEN_PREFIX}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

export function decodeDevAuthToken(token: string): DevAuthPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(token.slice(TOKEN_PREFIX.length), 'base64url').toString('utf8')) as unknown;

    if (!isRecord(decoded) || typeof decoded.userId !== 'string' || typeof decoded.email !== 'string') {
      return null;
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
