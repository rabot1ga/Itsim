import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { validateInitData } from '../middleware/telegramAuth.js';

/**
 * Auth routes — Telegram initData validation → signed JWT session
 */

const JWT_SECRET = process.env.JWT_SECRET || process.env.BOT_TOKEN || 'dev-secret';
const JWT_TTL_SECONDS = 60 * 60; // 1 hour

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/telegram
   * Validate initData → return session JWT
   */
  app.post('/telegram', async (request, reply) => {
    const { initData } = request.body as { initData?: string };

    if (!initData) {
      return reply.status(400).send({ error: 'initData required' });
    }

    const user = validateInitData(initData);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid initData' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username ?? null,
        first_name: user.first_name,
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_TTL_SECONDS }
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.first_name,
        username: user.username,
      },
    };
  });
}

/**
 * Verify a session token (used by telegramAuthHook)
 */
export function verifySessionToken(token: string): { id: number; username?: string; first_name?: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string') return null;
    return payload as { id: number; username?: string; first_name?: string };
  } catch {
    return null;
  }
}
