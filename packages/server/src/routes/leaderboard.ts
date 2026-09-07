import { FastifyInstance } from 'fastify';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Leaderboard — computed from real persisted player states
 * (packages/server/data/*.json). Replaces the hardcoded mock.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

export async function leaderboardRoutes(app: FastifyInstance) {
  /**
   * GET /api/leaderboard/friends
   * Top-20 real players by ratingScore
   */
  app.get('/friends', async (request) => {
    const userId = request.query && (request.query as any).userId
      ? String((request.query as any).userId)
      : null;

    const rows: Array<{
      rank: number;
      name: string;
      grade: string;
      rating: number;
      day: number;
      isYou: boolean;
    }> = [];

    try {
      for (const file of readdirSync(DATA_DIR)) {
        if (!file.endsWith('.json') || file === 'nft_registry.json') continue;
        try {
          const state = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
          if (!state || typeof state.currentDay !== 'number') continue;
          rows.push({
            rank: 0,
            name: state.firstName ?? `Игрок ${state.telegramId ?? ''}`.trim(),
            grade: state.grade ?? 'unemployed',
            rating: Math.round(state.ratingScore ?? 0),
            day: state.currentDay ?? 1,
            isYou: state.telegramId === userId,
          });
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // data dir missing — empty board
    }

    rows.sort((a, b) => b.rating - a.rating || b.day - a.day);
    return {
      leaderboard: rows.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 })),
      updatedAt: Date.now(),
    };
  });

  /**
   * GET /api/leaderboard/honest
   * Honest mode leaderboard (no boosters) — same data, separate endpoint for
   * the future no-booster filter
   */
  app.get('/honest', async () => {
    return { leaderboard: [], updatedAt: Date.now() };
  });
}
