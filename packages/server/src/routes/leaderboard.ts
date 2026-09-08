import { FastifyInstance } from 'fastify';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import { getLeaderboard } from '../services/leaderboardIndex.js';

/**
 * Leaderboard — computed from real persisted player states via the cached
 * index (`services/leaderboardIndex.ts`), so a request never touches the disk.
 *
 * `isYou` comes from the authenticated Telegram user, not from a query param:
 * the old `?userId=` contract silently produced `isYou: false` for everyone in
 * dev mode (see ANALYSIS §7.1).
 */

export async function leaderboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', telegramAuthHook);

  const handler = (honestOnly: boolean) => async (request: any) => {
    const user = (request as any).telegramUser;
    const userId = user ? String(user.id) : null;
    const { limit, offset } = request.query as { limit?: string; offset?: string };

    const page = await getLeaderboard({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      userId,
      honestOnly,
    });

    return {
      leaderboard: page.rows.map(({ userId: _userId, ...row }) => row),
      you: page.you ? (({ userId: _u, ...rest }) => rest)(page.you) : null,
      total: page.total,
      updatedAt: page.updatedAt,
    };
  };

  /**
   * GET /api/leaderboard/friends?limit=20&offset=0
   * Global board by ratingScore (top-N + your own rank).
   */
  app.get('/friends', handler(false));

  /**
   * GET /api/leaderboard/honest
   * Same board without booster-item owners.
   */
  app.get('/honest', handler(true));
}
