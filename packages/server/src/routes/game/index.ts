/**
 * Game routes — `/api/game/*`.
 *
 * The legacy `game.ts` (2.5k lines) was split into per-domain files in P1.14:
 *   - state.ts      — GET /state
 *   - action.ts     — POST /action
 *   - sprint.ts     — POST /sprint/claim
 *   - archetype.ts  — POST /archetype/{choose,claim}
 *   - interview.ts  — POST /interview/{start,answer,finish}
 *   - day.ts        — POST /advance-day, POST /event-choice
 *   - ending.ts     — runCtoElection helper (called from /action)
 *   - misc.ts       — POST /unlock-perk, /main-skill, /new-life, /reset
 *
 * All share types and helpers from `./shared.js`. The original `game.ts` is
 * re-exported from here so `src/index.ts` keeps working unchanged.
 */
import { FastifyInstance } from 'fastify';
import { telegramAuthHook } from '../../middleware/telegramAuth.js';
import { stateRoutes } from './state.js';
import { actionRoutes } from './actions.js';
import { sprintRoutes } from './sprint.js';
import { archetypeRoutes } from './archetype.js';
import { interviewRoutes } from './interview.js';
import { dayRoutes } from './day.js';
import { miscRoutes } from './misc.js';

export async function gameRoutes(app: FastifyInstance) {
  // All game routes require auth
  app.addHook('preHandler', telegramAuthHook);

  await app.register(stateRoutes);
  await app.register(actionRoutes);
  await app.register(sprintRoutes);
  await app.register(archetypeRoutes);
  await app.register(interviewRoutes);
  await app.register(dayRoutes);
  await app.register(miscRoutes);
}
