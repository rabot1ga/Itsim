/**
 * Archetype routes (P1.3) — `/api/game/archetype/{choose,claim}`.
 *
 * Archetypes are curated routes through the skill galaxy. The "choose" route
 * just highlights a route on the skill map; the "claim" route pays out a
 * one-time-per-life bonus when a route is fully walked by the player's
 * current skill levels.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import { clamp, validateArchetypeClaim } from '@itsim/shared';
import { calculateRating } from '@itsim/shared';
import { fmtMoney, respondState, StoredState } from './shared.js';

export async function archetypeRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/archetype/choose — pick the route highlighted on the skill map (P1.3).
   * body: { archetypeId?: string } — empty/null clears the highlight.
   * Choosing is free and can change at any time; it only drives the map UI.
   */
  app.post('/archetype/choose', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    const { archetypeId } = (request.body ?? {}) as { archetypeId?: string | null };
    if (!archetypeId) {
      state.archetypeChosen = undefined;
      saveState(userId, state);
      return { state: respondState(state, 'Подсветка пути снята') };
    }

    const def = (getContent().archetypes?.archetypes ?? []).find((a: any) => a.id === archetypeId);
    if (!def) {
      return reply.status(400).send({ error: 'Такого пути нет' });
    }
    state.archetypeChosen = archetypeId;
    saveState(userId, state);
    return { state: respondState(state, `🧭 Путь «${def.title}» выбран — следуй вехам на карте`) };
  });

  /**
   * POST /api/game/archetype/claim — one-time-per-life bonus for finishing a route (P1.3).
   *
   * Progress is never stored: the route must be fully walked by the player's
   * current skill levels right now, and each route pays out once per life
   * (state.archetypeBonuses — the prestige reset clears the ledger, so a new
   * life can walk and cash the same route again).
   */
  app.post('/archetype/claim', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    const { archetypeId } = (request.body ?? {}) as { archetypeId?: string };
    const content = getContent();
    const verdict = validateArchetypeClaim(content.archetypes?.archetypes, archetypeId, state);
    if ('error' in verdict) {
      return reply.status(400).send({ error: verdict.error, state: respondState(state) });
    }

    const def = verdict.def;
    const money = def.reward?.money ?? 0;
    const reputation = def.reward?.reputation ?? 0;
    if (money > 0) state.money += money;
    if (reputation > 0) state.reputation = clamp(state.reputation + reputation, 0, 100);
    state.archetypeBonuses = [...(state.archetypeBonuses ?? []), def.id];
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    const parts: string[] = [];
    if (money > 0) parts.push(`+${fmtMoney(money)}`);
    if (reputation > 0) parts.push(`+${reputation} репутации`);
    return {
      state: respondState(state, `🏆 Путь «${def.title}» пройден до конца: ${parts.join(', ')}`),
    };
  });
}
