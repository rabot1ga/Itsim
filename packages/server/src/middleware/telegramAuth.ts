import { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Telegram initData validation — section 14.1
 */

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TTL_SECONDS = 86400; // 24 hours

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
}

/**
 * Validate Telegram initData and return user info
 */
export function validateInitData(initData: string): TelegramUser | null {
  if (!BOT_TOKEN) {
    console.warn('BOT_TOKEN not set — auth validation disabled');
    return parseInitData(initData);
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  // 1. Build check string: key=value pairs sorted by key, joined by \n
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // 2. Secret key = HMAC-SHA256("WebAppData", bot_token)
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computed = createHmac('sha256', secret).update(checkString).digest('hex');

  // 3. Constant-time comparison
  const hashBuffer = Buffer.from(hash, 'hex');
  const computedBuffer = Buffer.from(computed, 'hex');

  if (hashBuffer.length !== computedBuffer.length) return null;
  if (!timingSafeEqual(hashBuffer, computedBuffer)) return null;

  // 4. TTL check
  const authDate = Number(params.get('auth_date'));
  if (Date.now() / 1000 - authDate > TTL_SECONDS) return null;

  return JSON.parse(params.get('user')!);
}

function parseInitData(initData: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Fastify preHandler for auth
 */
export async function telegramAuthHook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: 'Authorization header required' });
  }

  // Token format: "Bearer <jwt>" or "tma <initData>"
  const [scheme, token] = authHeader.split(' ');

  if (scheme === 'tma') {
    // First request: validate initData
    const user = validateInitData(token);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid initData' });
    }
    (request as any).telegramUser = user;
  } else if (scheme === 'Bearer') {
    // Subsequent requests: validate JWT (simplified — real impl would verify)
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      (request as any).telegramUser = payload;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }
  } else {
    return reply.status(401).send({ error: 'Invalid auth scheme' });
  }
}