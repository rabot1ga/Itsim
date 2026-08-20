import { FastifyInstance } from 'fastify';
import { validateInitData } from '../middleware/telegramAuth.js';

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

    // Generate simple JWT-like token (for MVP)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      id: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    }));
    const token = `${header}.${payload}.${btoa('signature_placeholder')}`;

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