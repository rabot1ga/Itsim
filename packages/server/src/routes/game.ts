import { FastifyInstance } from 'fastify';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import {
  createNewPlayer,
  calculateMaxEnergy,
  calculateOfflineBankedDays,
  advanceLastTick,
  applyXp,
  applyMotivationDrift,
  calculateRating,
} from '@itsim/shared';

// In-memory game state storage (MVP — replace with DB)
const gameStates = new Map<string, any>();

export async function gameRoutes(app: FastifyInstance) {
  // All game routes require auth
  app.addHook('preHandler', telegramAuthHook);

  /**
   * GET /api/game/state
   * Get current state + offline accrual
   */
  app.get('/state', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    let state = gameStates.get(userId);
    const isNew = !state;

    if (!state) {
      state = createNewPlayer();
      state.telegramId = userId;
      state.lastTickAt = Date.now();
      gameStates.set(userId, state);
    }

    // Calculate offline days
    const banked = calculateOfflineBankedDays(state.lastTickAt, Date.now());
    state.bankedDays = Math.min(7, state.bankedDays + banked);
    if (banked > 0) {
      state.lastTickAt = advanceLastTick(state.lastTickAt, banked);
    }

    // Recalculate max energy
    state.maxEnergy = calculateMaxEnergy(state);

    return {
      state,
      isNew,
      offlineDaysEarned: banked,
    };
  });

  /**
   * POST /api/game/action
   * Perform an action (idempotent)
   */
  app.post('/action', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { actionId, params, idempotencyKey } = request.body as any;

    const state = gameStates.get(userId);
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    // Idempotency check (simplified)
    if (idempotencyKey) {
      const existing = state._completedActions?.get?.(idempotencyKey);
      if (existing) return { state, delta: existing.delta };
    }

    // Validate energy
    const energyCost = getActionEnergyCost(actionId, params);
    if (state.energy < energyCost) {
      return reply.status(400).send({ error: 'Not enough energy' });
    }

    // Apply action
    const delta = applyAction(state, actionId, params);

    // Deduct energy
    state.energy -= energyCost;
    state.totalActions = (state.totalActions || 0) + 1;

    // Track idempotency
    if (idempotencyKey) {
      if (!state._completedActions) state._completedActions = new Map();
      state._completedActions.set(idempotencyKey, { delta });
    }

    // Recalc rating
    state.ratingScore = calculateRating(state);

    return { state, delta };
  });

  /**
   * POST /api/game/advance-day
   * End current day and advance
   */
  app.post('/advance-day', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = gameStates.get(userId);

    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    // Apply daily effects
    const { motivation } = applyMotivationDrift(
      state.motivation,
      state.health,
      state.job !== null,
      state.job?.companyCulture?.motivationPerDay ?? 0
    );
    state.motivation = motivation;

    // Regen energy
    state.energy = Math.min(state.maxEnergy, state.energy + calculateMaxEnergy(state) * 0.3);

    // Advance day
    state.currentDay++;
    state.daysSinceRegistration++;

    // Check for rent
    if (state.currentDay % 30 === 0) {
      const housingCost = getHousingCost(state.housingLevel);
      if (state.money >= housingCost) {
        state.money -= housingCost;
        state._lastEvent = `💰 Оплачено жильё: ${formatMoney(housingCost)}`;
      } else {
        state._lastEvent = '⚠️ Не хватило на оплату жилья!';
      }
    }

    // Check for salary
    if (state.job && state.currentDay % 7 === 0) {
      const salary = Math.round(state.job.salary / 4.3);
      state.money += salary;
      state._lastEvent = `💰 Получена зарплата: ${formatMoney(salary)}`;
    }

    // Recalc
    state.maxEnergy = calculateMaxEnergy(state);
    state.ratingScore = calculateRating(state);

    return { state };
  });

  /**
   * POST /api/game/event-choice
   * Make a choice in an event
   */
  app.post('/event-choice', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { eventId, choiceIndex } = request.body as any;

    const state = gameStates.get(userId);
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    // Simplified event handling
    state._lastChoice = { eventId, choiceIndex };

    return { state };
  });
}

// Helper functions
function getActionEnergyCost(actionId: string, params?: any): number {
  const costs: Record<string, number> = {
    study_youtube: 2,
    study_book: 1,
    study_stepik: 2,
    study_course: 3,
    study_advanced_course: 3,
    study_mentor: 3,
    work_task: 4,
    pet_project: 3,
    freelance_work: 4,
    rest_sleep: 0,
    rest_walk: 1,
    rest_bar: 2,
    rest_hobby: 1,
    networking: 2,
  };
  return costs[actionId] ?? 2;
}

function applyAction(state: any, actionId: string, params?: any): any {
  const delta: Record<string, any> = {};

  if (actionId.startsWith('study_')) {
    const xpGain = getStudyXp(actionId);
    const skillId = params?.skillId || 'javascript';
    const currentSkill = state.skills[skillId] || { level: 0, xp: 0 };
    const result = applyXp(currentSkill, xpGain, state.motivation);
    state.skills[skillId] = result;
    delta.skills = { [skillId]: { from: currentSkill.level, to: result.level } };
    state.money -= (params?.cost || 0);
    delta.money = -(params?.cost || 0);
  }

  if (actionId === 'pet_project') {
    const skillId = params?.skillId || 'javascript';
    const currentSkill = state.skills[skillId] || { level: 0, xp: 0 };
    const result = applyXp(currentSkill, 12, state.motivation);
    state.skills[skillId] = result;
    delta.skills = { [skillId]: { from: currentSkill.level, to: result.level } };
    // Pet project gives reputation too
    state.reputation = Math.min(100, (state.reputation || 0) + 0.5);
    delta.reputation = 0.5;
  }

  if (actionId === 'rest_bar' || actionId === 'rest_walk' || actionId === 'rest_hobby') {
    const motGain = { rest_bar: 12, rest_walk: 8, rest_hobby: 10, rest_sleep: 15 };
    state.motivation = Math.min(100, (state.motivation || 50) + (motGain[actionId] || 5));
    delta.motivation = motGain[actionId] || 5;
  }

  return delta;
}

function getStudyXp(actionId: string): number {
  const xpValues: Record<string, number> = {
    study_youtube: 6,
    study_book: 10,
    study_stepik: 14,
    study_course: 22,
    study_advanced_course: 30,
    study_mentor: 38,
  };
  return xpValues[actionId] ?? 6;
}

function getHousingCost(level: number): number {
  const costs = [5000, 25000, 50000, 40000, 150000];
  return costs[level] ?? 5000;
}

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}