import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';

import { config } from '../config.js';
import { loadState, saveState, deleteState, scanStates } from '../services/gameStore.js';
import { purchasesOf } from '../services/entitlements.js';

/**
 * Service endpoints for the Telegram bot process (`packages/bot`).
 *
 * The bot is a separate service without access to the save files, so anything
 * it needs — who to nudge, a player's summary, GDPR deletion — goes through
 * here. Authentication is a shared secret (`ADMIN_TOKEN`); when it is not set
 * the whole namespace answers 503 instead of silently running unprotected.
 */

function adminGuard(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.adminToken) {
    reply.status(503).send({ error: 'Admin API disabled (ADMIN_TOKEN is not set)' });
    return false;
  }
  const provided = String(request.headers['x-admin-token'] ?? '');
  const expected = config.adminToken;
  const ok =
    provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) {
    reply.status(401).send({ error: 'Invalid admin token' });
    return false;
  }
  return true;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    if (!adminGuard(request, reply)) return reply;
  });

  /**
   * POST /api/admin/nudges
   * Players whose offline energy bank is (nearly) full — i.e. players who are
   * losing progress by not opening the app. Returns them AND marks them as
   * notified in the same call, so a crashed bot cannot spam anyone twice.
   */
  app.post('/nudges', async (request) => {
    const {
      minBankedDays = 5,
      limit = 100,
      cooldownHours = 20,
      dryRun = false,
    } = (request.body ?? {}) as {
      minBankedDays?: number;
      limit?: number;
      cooldownHours?: number;
      dryRun?: boolean;
    };

    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const now = Date.now();
    const states = await scanStates();

    const candidates = states
      .filter(({ state }) => (state.bankedDays ?? 0) >= minBankedDays)
      .filter(({ state }) => now - (state.lastNudgeAt ?? 0) > cooldownMs)
      .filter(({ state }) => !state.careerEnding)
      .sort((a, b) => (b.state.bankedDays ?? 0) - (a.state.bankedDays ?? 0))
      .slice(0, Math.min(limit, 500));

    const nudges = candidates.map(({ userId, state }) => ({
      userId,
      name: state.firstName ?? 'Игрок',
      bankedDays: state.bankedDays ?? 0,
      currentDay: state.currentDay ?? 1,
      grade: state.grade ?? 'unemployed',
    }));

    if (!dryRun) {
      for (const { userId } of candidates) {
        const state = loadState(userId);
        if (!state) continue;
        state.lastNudgeAt = now;
        saveState(userId, state);
      }
    }

    return { nudges, total: nudges.length, dryRun };
  });

  /**
   * GET /api/admin/users/:id/summary — data for the bot's /stats command
   */
  app.get('/users/:id/summary', async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = loadState(id);
    if (!state) return reply.status(404).send({ error: 'No save for this user' });

    return {
      userId: id,
      name: state.firstName ?? 'Игрок',
      day: state.currentDay ?? 1,
      grade: state.grade ?? 'unemployed',
      money: state.money ?? 0,
      rating: Math.round(state.ratingScore ?? 0),
      bankedDays: state.bankedDays ?? 0,
      energy: `${state.energy ?? 0}/${state.maxEnergy ?? 10}`,
      health: state.health ?? 0,
      motivation: state.motivation ?? 0,
      achievements: (state.achievements ?? []).length,
      careerEnding: state.careerEnding ?? null,
      purchases: purchasesOf(id).length,
    };
  });

  /**
   * DELETE /api/admin/users/:id — GDPR «/delete_my_data»
   */
  app.delete('/users/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existed = Boolean(loadState(id));
    deleteState(id);
    return { ok: true, deleted: existed };
  });
}
