import { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { verifySessionToken } from '../routes/auth.js';

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
    console.warn('BOT_TOKEN not set — auth validation disabled (dev mode)');
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
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > TTL_SECONDS) return null;

  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
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
    // Dev-mode fallback: no header at all → Dev user (bulletproof preview)
    if (!BOT_TOKEN) {
      console.warn('Dev fallback: missing auth header treated as Dev user');
      (request as any).telegramUser = { id: 1, first_name: 'Dev' };
      return;
    }
    return reply.status(401).send({ error: 'Authorization header required' });
  }

  // Token format: "tma <initData>" or "Bearer <jwt>"
  const space = authHeader.indexOf(' ');
  const scheme = space >= 0 ? authHeader.slice(0, space) : authHeader;
  const token = space >= 0 ? authHeader.slice(space + 1).trim() : '';

  if (scheme === 'tma') {
    // initData is validated on EVERY request (Telegram-canonical pattern)
    let user = validateInitData(token);
    if (!user) {
      // Dev-mode fallback: tolerate legacy/malformed tokens (stale bundles)
      if (!BOT_TOKEN) {
        console.warn('Dev fallback: invalid tma token treated as Dev user');
        user = { id: 1, first_name: 'Dev' };
      } else {
        return reply.status(401).send({ error: 'Invalid initData' });
      }
    }
    (request as any).telegramUser = user;
  } else if (scheme === 'Bearer') {
    // Subsequent requests: verify signed session JWT
    const payload = verifySessionToken(token);
    if (!payload) {
      if (!BOT_TOKEN) {
        // Dev-mode fallback: any invalid session becomes the Dev user
        console.warn('Dev fallback: invalid Bearer token treated as Dev user');
        (request as any).telegramUser = { id: 1, first_name: 'Dev' };
      } else {
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }
    } else {
      (request as any).telegramUser = payload;
    }
  } else {
    return reply.status(401).send({ error: 'Invalid auth scheme' });
  }
}
