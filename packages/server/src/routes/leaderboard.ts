import { FastifyInstance } from 'fastify';
import { RATING_METRICS } from '@itsim/shared';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import { getLeaderboard, isRatingMetric } from '../services/leaderboardIndex.js';

/**
 * Leaderboard — computed from real persisted player states via the cached
 * index (`services/leaderboardIndex.js`), so a request never touches the disk.
 *
 * `isYou` comes from the authenticated Telegram user, not from a query param:
 * the old `?userId=` contract silently produced `isYou: false` for everyone in
 * dev mode (see ANALYSIS §7.1).
 *
 * `?metric=` выбирает, по чему считать место: `rating` (итог, 0…1000) или одна из
 * компонент движка (0…100). Вкладки «Карьера / Навыки / Деньги / Rep» из ТЗ
 * сортируют по тем самым числам, из которых сложен рейтинг, — второго источника
 * формулы не появляется. Неизвестная метрика отвечает 400, а не молча
 * пересортировывает на «рейтинг»: подпись на экране и порядок строк обязаны
 * совпадать.
 */

export async function leaderboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', telegramAuthHook);

  const handler = (honestOnly: boolean) => async (request: any, reply: any) => {
    const user = (request as any).telegramUser;
    const userId = user ? String(user.id) : null;
    const { limit, offset, metric } = request.query as { limit?: string; offset?: string; metric?: string };

    if (metric !== undefined && !isRatingMetric(metric)) {
      reply.code(400);
      return { error: `неизвестная метрика «${metric}», доступны: ${RATING_METRICS.join(', ')}` };
    }

    const page = await getLeaderboard({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      userId,
      honestOnly,
      metric,
    });

    return {
      leaderboard: page.rows.map(({ userId: _userId, parts: _parts, ...row }) => row),
      you: page.you ? (({ userId: _u, parts: _p, ...rest }) => rest)(page.you) : null,
      total: page.total,
      metric: page.metric,
      updatedAt: page.updatedAt,
    };
  };

  /**
   * GET /api/leaderboard/friends?limit=20&offset=0&metric=rating
   * Global board by `metric` (top-N + your own rank).
   */
  app.get('/friends', handler(false));

  /**
   * GET /api/leaderboard/honest
   * Same board without booster-item owners.
   */
  app.get('/honest', handler(true));
}
