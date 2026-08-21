import { FastifyInstance } from 'fastify';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import { getContent } from '../services/contentService.js';
import { loadState, saveState } from '../services/gameStore.js';
import {
  createNewPlayer,
  calculateMaxEnergy,
  calculateOfflineBankedDays,
  advanceLastTick,
  applyXp,
  applySoftXp,
  applyMotivationDrift,
  applyEventEffects,
  pickEvent,
  maybeTriggerActionEvent,
  calculateRating,
  checkAchievements,
  totalSkillLevels,
  clamp,
  GRADE_SALARIES,
  GRADE_ENERGY,
  GRADE_REQUIREMENTS,
  GRADE_ORDER,
  careerLevelIndex,
  weeklySalary,
  HOUSING_COSTS,
  freelancePayment,
  interviewChance,
  rollInterview,
  preScreenMatch,
  preScreenResult,
  generatePlayerSeed,
  getGeneticTraits,
  canLearnSkill,
  canUnlockPerk,
  miningDailyIncome,
  hashrateOfItems,
  electricitySaveOfItems,
  type PlayerState,
  type GameEvent,
  type Grade,
  type Offer,
  type Application,
} from '@itsim/shared';
import { getNftProvider } from '../services/nftProvider.js';

/**
 * Game routes — server-authoritative game loop.
 * Client sends intents (actions), server computes effects.
 */

type StoredState = PlayerState & {
  telegramId: string;
  lastTickAt: number;
  ratingScore: number;
  activeEventId: string | null;
  freelanceDoneToday: boolean;
  lastFreelanceDay: number;
  sideJobDoneToday: boolean;
  mainSkillId: string;
};

// Idempotent action cache: userId -> idempotencyKey -> response
const completedActions = new Map<string, Map<string, any>>();

// Energy costs for non-study actions (study costs come from balance.json xpSources)
const EXTRA_ENERGY_COSTS: Record<string, number> = {
  work_task: 4,
  work_overtime: 5,
  pet_project: 3,
  freelance: 4,
  rest_sleep: 0,
  rest_walk: 1,
  rest_bar: 2,
  rest_hobby: 1,
  rest_gym: 2,
  networking: 2,
  apply_job: 1,
  buy_item: 0,
  upgrade_housing: 0,
  accept_offer: 0,
  decline_offer: 0,
  cancel_application: 0,
  study_english: 2,
  study_english_course: 3,
  use_banked_day: 0,
};

const GRADE_POSITIONS: Record<Grade, string> = {
  unemployed: 'Безработный',
  intern: 'Стажёр',
  junior: 'Junior-разработчик',
  middle: 'Middle-разработчик',
  senior: 'Senior-разработчик',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

function rng(): number {
  return Math.random();
}

function eventPhaseChance(balance: any, day: number): number {
  if (day <= 10) return balance.eventChanceOnboarding ?? 0.2;
  if (day <= 30) return balance.eventChanceEarly ?? 0.35;
  if (day <= 150) return balance.eventChanceMid ?? 0.28;
  return balance.eventChanceLate ?? 0.2;
}

function fmtMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}

/**
 * Derive the deterministic "genotype" (DESIGN.md 3.1).
 * Wallet-bound if a wallet is bound, otherwise telegram-id fallback.
 */
function deriveGenetics(state: StoredState): void {
  const source = state.walletAddress ?? `tg:${state.telegramId}`;
  const seed = generatePlayerSeed(source);
  state.genetics = getGeneticTraits(seed, getContent().genetics);
}

/**
 * Attach the UI message to the response state (client shows state._lastEvent)
 */
function respondState(state: StoredState, message?: string) {
  return { ...state, _lastEvent: message };
}

/**
 * Highest grade the player currently qualifies for (skill + communication + reputation)
 */
function targetGrade(state: StoredState, content: any): Grade | null {
  let best: Grade | null = null;
  const comm = state.softSkills['communication']?.level ?? 0;
  const discount = Math.min(0.5, perkEffectSum(state, content, 'jobRequirementDiscount'));
  for (const grade of GRADE_ORDER) {
    if (grade === 'unemployed' || grade === 'cto') continue;
    const req = GRADE_REQUIREMENTS[grade];
    if (totalSkillLevels(state) >= req.skill * (1 - discount) && comm >= req.comm && state.reputation >= req.rep) {
      best = grade;
    }
  }
  return best;
}

export async function gameRoutes(app: FastifyInstance) {
  // All game routes require auth
  app.addHook('preHandler', telegramAuthHook);

  /**
   * GET /api/game/state — current state + offline energy banking
   */
  app.get('/state', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    let state = loadState(userId) as StoredState | null;
    const isNew = !state;
    if (!state) {
      state = { ...createNewPlayer(), telegramId: userId, lastTickAt: Date.now(), ratingScore: 0, activeEventId: null, freelanceDoneToday: false, lastFreelanceDay: 0, sideJobDoneToday: false, mainSkillId: 'javascript' } as StoredState;
      deriveGenetics(state);
    }

    // Refresh cross-collection bonuses (DESIGN.md 3.3)
    state.crossBonuses = [];
    for (const col of await getNftProvider().getActiveBonuses(state.walletAddress ?? `local:${userId}`)) {
      state.crossBonuses.push(...col.bonuses);
    }

    // Offline energy banking (1 game day / 3.5 real hours, max 7 in bank)
    const banked = calculateOfflineBankedDays(state.lastTickAt, Date.now());
    if (banked > 0) {
      state.bankedDays = Math.min(7, state.bankedDays + banked);
      state.lastTickAt = advanceLastTick(state.lastTickAt, banked);
    }

    state.maxEnergy = recalcMaxEnergy(state, getContent());
    state.ratingScore = calculateRating(state);

    // Surface pending chain events even if the user missed the day roll
    let activeEvent: GameEvent | null = null;
    if (state.activeEventId) {
      activeEvent = getContent().events.find((e: any) => e.id === state.activeEventId) ?? null;
    } else {
      const due = state.pendingEvents.find((e) => e.triggerDay <= state.currentDay);
      if (due) {
        const ev = getContent().events.find((e: any) => e.id === due.eventId);
        if (ev) {
          state.activeEventId = ev.id;
          activeEvent = ev;
        }
      }
    }

    saveState(userId, state);

    return {
      state: respondState(state, isNew ? 'Добро пожаловать в IT Life Simulator! 💻' : undefined),
      isNew,
      offlineDaysEarned: banked,
      activeEvent,
      mining: miningSummary(state, getContent()),
    };
  });

  /**
   * POST /api/game/action — perform a game action (idempotent)
   */
  app.post('/action', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { actionId, params, idempotencyKey } = request.body as { actionId?: string; params?: any; idempotencyKey?: string };

    if (!actionId) {
      return reply.status(400).send({ error: 'actionId required' });
    }

    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    // Idempotency — return the stored result for a duplicate request
    if (idempotencyKey) {
      const cache = completedActions.get(userId);
      const existing = cache?.get(idempotencyKey);
      if (existing) return { state: respondState(state, existing.message), delta: existing.delta, activeEvent: null };
    }

    const content = getContent();

    // Validate costs BEFORE any mutation (idempotency-safe)
    const energyCost = getActionEnergyCost(actionId, params, content);
    if (state.energy < energyCost) {
      return reply.status(400).send({ error: 'Не хватает энергии — заверши день или отдохни', state: respondState(state) });
    }

    const moneyCost = getActionMoneyCost(actionId, params, state, content);
    if (moneyCost !== null && state.money < moneyCost) {
      return reply.status(400).send({ error: 'Не хватает денег', state: respondState(state) });
    }

    const result = applyAction(state, actionId, params, content);
    if (result.error) {
      return reply.status(400).send({ error: result.error, state: respondState(state) });
    }

    state.energy -= energyCost;
    if (moneyCost !== null) state.money -= moneyCost;

    state.totalActions += 1;
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    // Mint NFT if the purchased item is on-chain (mock provider, DESIGN.md 3.2)
    let nft = null;
    const mintedItem = result.delta?.mintedItem;
    if (mintedItem) {
      const wallet = state.walletAddress ?? `local:${userId}`;
      const itemType = (content.items as any[]).find((i: any) => i.id === mintedItem.id)?.type ?? 'item';
      nft = await getNftProvider().mint(wallet, mintedItem, String(itemType).toUpperCase().slice(0, 10));
    }

    // Action-triggered follow-up events (bar -> HR, freelance -> ghost client, ...)
    let triggeredEvent: GameEvent | null = null;
    if (!state.activeEventId) {
      triggeredEvent = maybeTriggerActionEvent(state, content.events, actionId, params?.jobId, rng);
      if (triggeredEvent) {
        state.activeEventId = triggeredEvent.id;
        saveState(userId, state);
      }
    }

    const response = { state: respondState(state, result.message), delta: result.delta ?? {}, activeEvent: triggeredEvent, nft, mining: miningSummary(state, content) };
    if (idempotencyKey) {
      if (!completedActions.has(userId)) completedActions.set(userId, new Map());
      completedActions.get(userId)!.set(idempotencyKey, { delta: result.delta, message: result.message });
    }
    return response;
  });

  /**
   * POST /api/game/advance-day — end current day, apply daily effects
   */
  app.post('/advance-day', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return { error: 'Game not started' };
    }

    const messages: string[] = [];
    const content = getContent();

    advanceDay(state, content, messages);

    // Event roll
    const event = maybeTriggerEvent(state, content);
    if (event) {
      messages.push(`📢 ${event.title}`);
    }

    // Achievements
    const earned = checkAchievements(state, content.achievements);
    for (const a of earned) {
      messages.push(`🏆 Достижение: ${a.icon} ${a.name} — ${a.description}`);
    }

    saveState(userId, state);

    return {
      state: respondState(state, messages.length > 0 ? messages.join('\n') : undefined),
      messages,
      activeEvent: event,
      mining: miningSummary(state, content),
    };
  });

  /**
   * POST /api/game/event-choice — resolve an event choice
   */
  app.post('/event-choice', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { eventId, choiceIndex } = request.body as { eventId?: string; choiceIndex?: number };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    if (!eventId || choiceIndex === undefined) {
      return reply.status(400).send({ error: 'eventId and choiceIndex required' });
    }
    if (state.activeEventId !== eventId) {
      return reply.status(400).send({ error: 'Это событие уже не активно' });
    }

    const content = getContent();
    const event = content.events.find((e: any) => e.id === eventId);
    if (!event) return reply.status(404).send({ error: 'Событие не найдено' });

    const choice = event.choices[choiceIndex];
    if (!choice) return reply.status(400).send({ error: 'Некорректный выбор' });

    // Requirement gates (energy/money/skills/relations)
    const req = choice.requires;
    if (req) {
      if (req.energy && state.energy < req.energy) {
        return reply.status(400).send({ error: 'Не хватает энергии для этого выбора' });
      }
      if (req.money && state.money < req.money) {
        return reply.status(400).send({ error: 'Не хватает денег для этого выбора' });
      }
      if (req.skill) {
        for (const [skillId, level] of Object.entries(req.skill as Record<string, number>)) {
          if ((state.skills[skillId]?.level ?? 0) < level) {
            return reply.status(400).send({ error: 'Недостаточно навыков для этого выбора' });
          }
        }
      }
      if (req.minRelation) {
        for (const [npcId, rel] of Object.entries(req.minRelation as Record<string, number>)) {
          if ((state.relationships[npcId] ?? 0) < rel) {
            return reply.status(400).send({ error: 'Отношения недостаточно хорошие для этого выбора' });
          }
        }
      }
    }

    // Apply effects (returns a new state object)
    const updated = applyEventEffects(state, choice);
    Object.assign(state, updated);

    // Event bookkeeping
    const hist = state.eventHistory[eventId] ?? { lastDay: 0, count: 0 };
    state.eventHistory = { ...state.eventHistory, [eventId]: { lastDay: state.currentDay, count: hist.count + 1 } };
    state.recentEventTags = [...state.recentEventTags, ...(event.tags ?? [])].slice(-6);
    state.activeEventId = null;

    // Chain events
    if (choice.chain && rng() < (choice.chain.chance ?? 1)) {
      state.pendingEvents = [
        ...state.pendingEvents.filter((e) => e.eventId !== choice.chain!.eventId),
        { eventId: choice.chain!.eventId, triggerDay: state.currentDay + choice.chain!.afterDays },
      ];
    }

    const earned = checkAchievements(state, content.achievements);
    const followup = choice.followup ?? '';
    const extra = earned.map((a) => `🏆 Достижение: ${a.icon} ${a.name}`).join('\n');
    const message = [followup, extra].filter(Boolean).join('\n') || undefined;

    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    return {
      state: respondState(state, message),
      followup,
      activeEvent: null,
      achievements: earned,
    };
  });

  /**
   * POST /api/game/unlock-perk
   * Unlock a perk when its requirements are met
   */
  app.post('/unlock-perk', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { perkId } = request.body as { perkId?: string };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const content = getContent();
    const perk = (content.perks as any[]).find((p) => p.id === perkId);
    if (!perk) return reply.status(404).send({ error: 'Перк не найден' });
    if (state.perks.includes(perk.id)) {
      return reply.status(400).send({ error: 'Перк уже открыт' });
    }

    // branchOf map from content so branch requirements work for any branch
    const branchOf: Record<string, string> = {};
    for (const skill of content.skills as any[]) {
      branchOf[skill.id] = skill.branch;
    }

    if (!canUnlockPerk(state, perk.requires, branchOf)) {
      return reply.status(400).send({ error: `Не выполнены требования: ${describePerkRequires(perk.requires, content)}` });
    }

    state.perks = [...state.perks, perk.id];
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    return { state: respondState(state, `✨ Перк открыт: ${perk.name} — ${perk.flavor}`) };
  });

  /**
   * POST /api/game/main-skill
   * Set the skill that study/work actions train
   */
  app.post('/main-skill', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { skillId } = request.body as { skillId?: string };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const content = getContent();
    const skill = (content.skills as any[]).find((s) => s.id === skillId);
    if (!skill) return reply.status(404).send({ error: 'Навык не найден' });
    if (!canLearnSkill(state, skill)) {
      const parentReq = Object.entries(skill.unlockAt ?? {})
        .map(([pid, lvl]) => `${pid} ${lvl}+`)
        .join(', ');
      return reply.status(400).send({ error: `Навык «${skill.name}» заблокирован. Нужно: ${parentReq}` });
    }

    state.mainSkillId = skill.id;
    saveState(userId, state);
    return { state: respondState(state, `🎯 Основной навык: ${skill.name}`) };
  });

  /**
   * POST /api/game/reset — start over (dev convenience)
   */
  app.post('/reset', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = { ...createNewPlayer(), telegramId: userId, lastTickAt: Date.now(), ratingScore: 0, activeEventId: null, freelanceDoneToday: false, lastFreelanceDay: 0, sideJobDoneToday: false, mainSkillId: 'javascript' } as StoredState;
    deriveGenetics(state);
    saveState(userId, state);
    return { state: respondState(state, 'Новая жизнь началась! 💻'), activeEvent: null };
  });
}

/**
 * Total energy bonus from owned perks
 */
function perkEnergyBonus(state: StoredState, content: any): number {
  let bonus = 0;
  for (const perk of content.perks as any[]) {
    if (state.perks.includes(perk.id)) bonus += perk.effects?.energyBonus ?? 0;
  }
  return bonus;
}

/**
 * Recalculate max energy including owned perk bonuses
 */
function recalcMaxEnergy(state: StoredState, content: any): number {
  return calculateMaxEnergy(state, perkEnergyBonus(state, content));
}

/**
 * Effective motivation for XP gains (learning perks boost it)
 */
function xpMotivation(state: StoredState, content: any): number {
  const learning = perkEffectSum(state, content, 'learningBonus');
  return state.motivation + Math.round(learning / 0.006); // 0.15 → +25
}

/**
 * Human-readable perk requirements (e.g. "Frontend 40+")
 */
function describePerkRequires(requires: Record<string, number>, content: any): string {
  const skillName = (id: string) => (content.skills as any[]).find((s) => s.id === id)?.name ?? id;
  const softNames: Record<string, string> = {
    communication: 'Коммуникация',
    english: 'Английский',
    time_management: 'Тайм-менеджмент',
    leadership: 'Лидерство',
    stress_resistance: 'Стрессоустойчивость',
    public_speaking: 'Выступления',
  };
  const branchNames: Record<string, string> = {
    frontend: 'Frontend', backend: 'Backend', mobile: 'Mobile', qa: 'QA',
    devops: 'DevOps', ai_ml: 'AI/ML', cybersec: 'Кибербез',
    gamedev: 'GameDev', blockchain: 'Blockchain',
  };
  return Object.entries(requires)
    .map(([key, lvl]) => {
      if (key.endsWith('Branch')) {
        const branch = key.replace('Branch', '');
        return `${branchNames[branch] ?? branch}: ${lvl}`;
      }
      if (softNames[key]) return `${softNames[key]}: ${lvl}`;
      return `${skillName(key)}: ${lvl}`;
    })
    .join(', ');
}

/**
 * Sum a numeric perk effect across all owned perks
 */
function perkEffectSum(state: StoredState, content: any, effectKey: string): number {
  let total = 0;
  for (const perk of content.perks as any[]) {
    if (state.perks.includes(perk.id) && perk.effects?.[effectKey]) {
      total += perk.effects[effectKey];
    }
  }
  return total;
}

/**
 * Mining summary for the current state (null when no hardware)
 */
function miningSummary(state: StoredState, content: any) {
  const hashrate = hashrateOfItems(state.items, content.items);
  if (hashrate <= 0) return null;

  const cfg = content.balance.mining ?? { priceBase: 40, volatility: 0.5, electricityPerHashrate: 0.5 };
  const income = miningDailyIncome(hashrate, state.currentDay, cfg);
  const mult = 1 + perkEffectSum(state, content, 'miningIncomeMult');
  const save = electricitySaveOfItems(state.items, content.items);
  const gross = Math.round(income.gross * mult);
  const electricity = Math.round(income.electricity * (1 - save));
  return {
    hashrate,
    price: income.price,
    gross,
    electricity,
    net: gross - electricity,
  };
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

function getActionEnergyCost(actionId: string, params: any, content: any): number {
  if (actionId.startsWith('study_')) {
    return content.balance.xpSources?.[actionId]?.energy ?? 2;
  }
  if (actionId === 'networking') {
    return content.balance.networking?.energy ?? EXTRA_ENERGY_COSTS.networking;
  }
  if (actionId === 'side_job') {
    return content.balance.sideJobs?.[params?.jobId]?.energy ?? 1;
  }
  return EXTRA_ENERGY_COSTS[actionId] ?? 1;
}

function getActionMoneyCost(actionId: string, params: any, state: PlayerState, content: any): number | null {
  switch (actionId) {
    case 'study_book':
    case 'study_stepik':
    case 'study_course':
    case 'study_advanced_course':
    case 'study_mentor':
      return content.balance.xpSources?.[actionId]?.cost ?? 0;
    case 'rest_bar':
      return 2000;
    case 'rest_gym':
      return 3000;
    case 'study_english_course':
      return 3000;
    case 'buy_item': {
      const item = content.items.find((i: any) => i.id === params?.itemId);
      return item ? item.price : null;
    }
    case 'upgrade_housing': {
      const next = state.housingLevel + 1;
      if (next > 4) return null;
      return HOUSING_COSTS[next] ?? null;
    }
    default:
      return null;
  }
}

interface ActionResult {
  error?: string;
  message?: string;
  delta?: Record<string, any>;
}

function applyAction(state: StoredState, actionId: string, params: any, content: any): ActionResult {
  const delta: Record<string, any> = {};

  // ---- Study actions (hard skills from balance.xpSources) ----
  const isHardSkillStudy = actionId.startsWith('study_') && actionId !== 'study_english' && actionId !== 'study_english_course';
  if (isHardSkillStudy) {
    const source = content.balance.xpSources?.[actionId];
    if (!source) return { error: 'Неизвестное действие' };

    const skillId = params?.skillId || state.mainSkillId || 'javascript';

    // Skill-tree gating: locked skills cannot be trained
    const skillDef = (content.skills as any[]).find((s) => s.id === skillId);
    if (!skillDef) return { error: 'Неизвестный навык' };
    if (!canLearnSkill(state, skillDef)) {
      const parentReq = Object.entries(skillDef.unlockAt ?? {})
        .map(([pid, lvl]) => `${pid} ${lvl}+`)
        .join(', ');
      return { error: `Навык «${skillDef.name}» заблокирован. Нужно: ${parentReq}` };
    }

    if (source.maxLevel && (state.skills[skillId]?.level ?? 0) >= source.maxLevel) {
      return { error: 'Этот источник знаний больше ничего не даёт — пора переходить на следующий уровень' };
    }

    state.mainSkillId = skillId;
    const current = state.skills[skillId] ?? { level: 0, xp: 0 };
    const next = applyXp(current, source.xp ?? 6, xpMotivation(state, content));
    state.skills = { ...state.skills, [skillId]: next };
    delta.skills = { [skillId]: { from: current.level, to: next.level } };
    delta.money = -(source.cost ?? 0);

    const leveled = next.level > current.level ? ` (${current.level} → ${next.level})` : '';
    return { message: `📚 Учёба: ${skillId}${leveled}`, delta };
  }

  switch (actionId) {
    // ---- English (soft skill, gates foreign companies) ----
    case 'study_english': {
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, english: applySoftXp(eng, 10) };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return { message: `🇬🇧 Английский: бесплатные уроки с котиками. Уровень ${state.softSkills['english'].level}`, delta };
    }

    case 'study_english_course': {
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, english: applySoftXp(eng, 25) };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return { message: `🇬🇧 Интенсивный курс английского: уровень ${state.softSkills['english'].level}. Now you can ask for a raise`, delta };
    }

    // ---- Banked offline days (free time) ----
    case 'use_banked_day': {
      if ((state.bankedDays ?? 0) < 1) {
        return { error: 'Банк офлайн-дней пуст. Он копится, пока тебя нет: 1 день за 3.5 часа' };
      }
      state.bankedDays -= 1;
      state.energy = state.maxEnergy;
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.energy = state.maxEnergy;
      delta.motivation = 10;
      return { message: `⏰ Офлайн-день использован: полная энергия и +10 мотивации. В банке осталось ${state.bankedDays}`, delta };
    }
    // ---- Work ----
    case 'work_task': {
      if (!state.job) return { error: 'У тебя нет работы. Сначала откликнись на вакансию в разделе «Карьера»' };
      const learningMult = state.job.companyCulture?.learningMult ?? 1;
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, Math.round(8 * learningMult), xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.job.daysWorked += 1;
      state.motivation = clamp(state.motivation - 1, 0, 100);
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: '💼 Закрыл рабочие задачи. Ретроспектива отменена, все свободны' };
    }

    case 'work_overtime': {
      if (!state.job) return { error: 'У тебя нет работы' };
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, 10, xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      const bonus = Math.round(weeklySalary(state.job.salary) * 0.2);
      state.money += bonus;
      state.motivation = clamp(state.motivation - 4, 0, 100);
      state.health = clamp(state.health - 1, 0, 100);
      state.job.daysWorked += 1;
      delta.money = bonus;
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: `🌙 Переработка. Начальник доволен (+${fmtMoney(bonus)}), спина — нет` };
    }

    case 'pet_project': {
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, 12, xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.reputation = clamp(state.reputation + 0.5, 0, 100);
      delta.reputation = 0.5;
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: '🚀 Пет-проект: ещё один TODO-трекер в портфолио. Репутация растёт' };
    }

    // ---- Freelance ----
    case 'freelance': {
      if (state.freelanceDoneToday) return { error: 'Сегодня уже был фриланс-заказ. Заказчики спят' };
      const skillId = state.mainSkillId;
      const level = state.skills[skillId]?.level ?? 0;
      if (level < 3) return { error: 'Слишком мало опыта для фриланса — покачай навыки' };
      const difficulty = level < 25 ? 'easy' : level < 50 ? 'medium' : 'hard';
      const cooldown = { easy: 3, medium: 5, hard: 7 }[difficulty];
      if (state.lastFreelanceDay !== undefined && state.currentDay - state.lastFreelanceDay < cooldown) {
        return { error: 'Заказчики пока не вернулись с новыми проектами. Попробуй позже' };
      }
      let payment = freelancePayment(level, state.reputation, difficulty);

      // Cross-collection bonuses (DESIGN.md 3.3): e.g. SMB Gen2 → +5% freelance
      const crossMult = (state.crossBonuses ?? [])
        .filter((b) => b.type === 'freelance_mult')
        .reduce((sum, b) => sum + b.value, 0);
      const perkMult = Math.max(0, perkEffectSum(state, content, 'freelancePaymentMult') - 1);
      const totalMult = 1 + crossMult + perkMult;
      if (totalMult !== 1) {
        payment = Math.round(payment * totalMult);
      }
      state.money += payment;
      state.freelanceDoneToday = true;
      state.lastFreelanceDay = state.currentDay;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, 5, xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.reputation = clamp(state.reputation + 0.2, 0, 100);
      delta.money = payment;
      return { message: `🛠 Фриланс-заказ выполнен: +${fmtMoney(payment)}. Отзыв: «всё ок, но правки уже в личке»`, delta };
    }

    // ---- Side jobs (non-IT gigs: courier, barista, etc.) ----
    case 'side_job': {
      const jobId = params?.jobId;
      const job = content.balance.sideJobs?.[jobId];
      if (!job) return { error: 'Неизвестная подработка' };
      if (state.sideJobDoneToday) return { error: 'Сегодня уже была подработка. Совмещать курьера и баристу нельзя — проверено' };
      if (state.currentDay < (job.minDay ?? 1)) return { error: 'Эта подработка откроется позже' };

      const level = state.skills[state.mainSkillId]?.level ?? 0;
      if (level < (job.minSkill ?? 0)) {
        return { error: `Нужен навык ${job.minSkill}+ в основной специализации` };
      }

      let payment = job.payment + (job.paymentPerSkill ? Math.round(level * job.paymentPerSkill) : 0);
      if (job.paymentVar) payment += Math.floor(rng() * job.paymentVar);

      // Perk: sideJobPaymentMult
      const mult = perkEffectSum(state, content, 'sideJobPaymentMult');
      payment = Math.round(payment * (1 + mult));

      state.money += payment;
      state.sideJobDoneToday = true;
      state.health = clamp(state.health + (job.health ?? 0), 0, 100);
      state.motivation = clamp(state.motivation + (job.motivation ?? 0), 0, 100);
      state.reputation = clamp(state.reputation + (job.repGain ?? 0), 0, 100);
      if (job.commXp) {
        const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
        state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, job.commXp) };
      }
      delta.money = payment;
      return { message: `${job.icon} ${job.name}: +${fmtMoney(payment)}. «Это временно, я же айтишник» — говоришь ты себе`, delta };
    }

    // ---- Rest ----
    case 'rest_sleep':
      state.motivation = clamp(state.motivation + 15, 0, 100);
      state.health = clamp(state.health + 2, 0, 100);
      delta.motivation = 15;
      delta.health = 2;
      return { message: '😴 Поспал как человек. Или как айтишник: 10 часов' };

    case 'rest_walk':
      state.motivation = clamp(state.motivation + 8, 0, 100);
      state.health = clamp(state.health + 1, 0, 100);
      delta.motivation = 8;
      delta.health = 1;
      return { message: '🚶 Прогулка. Впервые за неделю увидел солнце' };

    case 'rest_bar':
      state.motivation = clamp(state.motivation + 12, 0, 100);
      delta.motivation = 12;
      return { message: '🍺 Бар с друзьями: обсудили дженерики, легаси и почему всё горит' };

    case 'rest_hobby':
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.motivation = 10;
      return { message: '🎮 Хобби-вечер. Да, сборка лего — это тоже хобби' };

    case 'rest_gym':
      state.health = clamp(state.health + 3, 0, 100);
      state.motivation = clamp(state.motivation + 2, 0, 100);
      delta.health = 3;
      delta.motivation = 2;
      return { message: '🏋️ Качалка. Мышцы болят, зато деплой не страшен' };

    // ---- Social ----
    case 'networking': {
      const net = content.balance.networking ?? { commXp: 5, repGain: 0.5, energy: 2 };
      const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, net.commXp) };
      state.reputation = clamp(state.reputation + net.repGain, 0, 100);
      delta.reputation = net.repGain;
      const npcs = content.npcs as any[];
      if (npcs.length > 0 && rng() < 0.3) {
        const npc = npcs[Math.floor(rng() * npcs.length)];
        state.relationships = { ...state.relationships, [npc.id]: clamp((state.relationships[npc.id] ?? 0) + 2, -100, 100) };
        return { message: `🤝 Митап: новые знакомства (+${npc.name} в контактах). Доклад был скучный, пицца — нет` };
      }
      return { message: '🤝 Митап: раздал визитки, собрал 40 стикеров. Репутация растёт' };
    }

    // ---- Career ----
    case 'apply_job': {
      if (state.job) return { error: 'У тебя уже есть работа. Сначала уволься... то есть дойди до выгорания' };
      if (state.currentApplication && ['pending', 'interview_scheduled'].includes(state.currentApplication.status)) {
        return { error: 'У тебя уже есть активный отклик. Дождись результата' };
      }

      const companyId = params?.companyId;
      const company = (content.companies as any[]).find((c) => c.id === companyId);
      if (!company) return { error: 'Компания не найдена' };

      const english = state.softSkills['english']?.level ?? 0;
      if (english < (company.requiresEnglish ?? 0)) {
        return { error: `Нужен английский ${company.requiresEnglish}+. Твой уровень: ${english}. Качай язык!` };
      }

      const grade = targetGrade(state, content);
      if (!grade) {
        return { error: 'Пока рано откликаться — подтяни навыки (18+ суммарно) и коммуникацию' };
      }

      const req = GRADE_REQUIREMENTS[grade];
      const skillId = state.mainSkillId;
      const requirements = { [skillId]: req.skill };
      const matchScore = preScreenMatch(
        Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level])),
        requirements
      );
      const screen = preScreenResult(matchScore);

      const application: Application = {
        companyId,
        position: GRADE_POSITIONS[grade],
        grade,
        status: screen.passed ? 'interview_scheduled' : 'rejected',
        matchScore,
        interviewDay: state.currentDay + 2,
        requirements,
        result: screen.passed ? undefined : 'rejected',
      };
      state.currentApplication = application;
      delta.application = application;

      if (!screen.passed) {
        return { message: `📄 ${company.name}: ${screen.msg}`, delta };
      }
      return { message: `📄 Отклик в «${company.name}» отправлен. ${screen.msg} Собеседование через 2 дня` };
    }

    case 'cancel_application': {
      if (!state.currentApplication) return { error: 'Нет активного отклика' };
      state.currentApplication = null;
      return { message: 'Отклик отозван. Заказчики кармы плакали' };
    }

    case 'accept_offer': {
      const offer = state.pendingOffers.find((o) => o.companyId === params?.companyId);
      if (!offer) return { error: 'Оффер не найден или истёк' };
      const company = (content.companies as any[]).find((c) => c.id === offer.companyId);
      if (!company) return { error: 'Компания не найдена' };

      state.job = {
        companyId: offer.companyId,
        position: offer.position,
        grade: offer.grade,
        salary: offer.salary,
        energyPerDay: GRADE_ENERGY[offer.grade],
        daysWorked: 0,
        daysSinceLastPromotion: 0,
        companyCulture: company.culture,
      };
      state.grade = offer.grade;
      state.pendingOffers = [];
      state.currentApplication = null;
      delta.job = state.job;

      return { message: `🎉 Ты принят в «${company.name}» на позицию ${offer.position}! Зарплата: ${fmtMoney(offer.salary)}/мес` };
    }

    case 'decline_offer': {
      const before = state.pendingOffers.length;
      state.pendingOffers = state.pendingOffers.filter((o) => o.companyId !== params?.companyId);
      if (state.pendingOffers.length === before) return { error: 'Оффер не найден' };
      return { message: 'Оффер отклонён. HR переживёт... наверное' };
    }

    // ---- Shop ----
    case 'buy_item': {
      const item = (content.items as any[]).find((i) => i.id === params?.itemId);
      if (!item) return { error: 'Предмет не найден' };
      if (state.items.includes(item.id)) return { error: 'Уже куплено' };
      state.items = [...state.items, item.id];
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.items = [...state.items];
      if (item.nft) {
        // NFT items are minted on purchase (DESIGN.md 3.2) — mock provider
        delta.mintedItem = {
          id: item.id,
          name: item.name,
          description: item.description,
          rarity: item.rarity,
          layerId: item.layerId,
        };
        return { message: `🛒 Куплено: ${item.name}. NFT смонтирован (мок) 🔗`, delta };
      }
      return { message: `🛒 Куплено: ${item.name}` };
    }

    case 'upgrade_housing': {
      const next = (state.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
      if (next > 4) return { error: 'Лучше уже некуда. Это пентхаус, Карл' };
      const cost = HOUSING_COSTS[next];
      if (state.money < cost) return { error: 'Не хватает денег на переезд' };
      state.housingLevel = next;
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.housingLevel = next;
      return { message: `🏠 Переезд: новый уровень жилья ${next}. Запах картонных коробок — запах свободы` };
    }

    default:
      return { error: 'Неизвестное действие' };
  }
}

// ---------------------------------------------------------------------------
// Day cycle
// ---------------------------------------------------------------------------

function advanceDay(state: StoredState, content: any, messages: string[]) {
  const company = state.job
    ? (content.companies as any[]).find((c: any) => c.id === state.job!.companyId)
    : null;
  const culture = company?.culture ?? null;

  // 1. Motivation drift + burnout
  const drift = applyMotivationDrift(
    state.motivation,
    state.health,
    state.job !== null,
    culture?.motivationPerDay ?? 0
  );
  let newMotivation = drift.motivation;
  const resistance = Math.min(1, perkEffectSum(state, content, 'motivationResistance'));
  if (resistance > 0 && newMotivation < state.motivation) {
    newMotivation = Math.round(state.motivation - (state.motivation - newMotivation) * (1 - resistance));
  }
  state.motivation = newMotivation;
  if (state.motivation <= 0) {
    state.burnoutDays += 1;
    if (state.burnoutDays === 3) {
      messages.push('🔥 Ты на грани выгорания. Срочно отдохни!');
    }
  } else if (state.motivation >= 50) {
    state.burnoutDays = 0;
  }

  // 2. Health drift
  state.health = clamp(state.health + (culture?.healthPerDay ?? 0), 0, 100);

  // 3. Day counter
  state.currentDay += 1;
  state.daysSinceRegistration += 1;

  // 4. Job: work day, layoff risk, warnings, promotion
  if (state.job) {
    state.job.daysWorked += 1;
    state.job.daysSinceLastPromotion += 1;

    if (state.jobWarnings >= 3) {
      messages.push(`💀 Три предупреждения — тебя уволили из ${company?.name ?? 'компании'}. Свобода!`);
      state.job = null;
    } else if (company && rng() < (company.culture?.layoffRisk ?? 0)) {
      messages.push(`📉 Сокращение в «${company.name}». Ты в списке. Рынок, держись!`);
      state.job = null;
    } else if (state.job.daysSinceLastPromotion >= 7) {
      tryPromote(state, company, messages);
    }
  }

  // 5. Weekly salary
  if (state.job && state.currentDay % 7 === 0) {
    const salary = weeklySalary(state.job.salary);
    state.money += salary;
    messages.push(`💰 Зарплата: +${fmtMoney(salary)}`);
  }

  // 6. Monthly rent
  if (state.currentDay % 30 === 0) {
    const cost = HOUSING_COSTS[state.housingLevel] ?? 0;
    if (state.money >= cost) {
      state.money -= cost;
      messages.push(`🏠 Оплачено жильё: ${fmtMoney(cost)}`);
    } else {
      state.money = 0;
      state.motivation = clamp(state.motivation - 8, 0, 100);
      messages.push(`⚠️ Не хватило денег на жильё (${fmtMoney(cost)}). Мотивация упала. Срочно нужен доход!`);
    }
  }

  // 7. Interview resolution
  const app = state.currentApplication;
  if (app && app.status === 'interview_scheduled' && state.currentDay >= app.interviewDay) {
    resolveInterview(state, app, content, messages);
  }

  // 8. Offer expiry
  for (const offer of state.pendingOffers) {
    offer.expiresInDays -= 1;
  }
  const expired = state.pendingOffers.filter((o) => o.expiresInDays <= 0);
  if (expired.length > 0) {
    state.pendingOffers = state.pendingOffers.filter((o) => o.expiresInDays > 0);
    messages.push(`⏳ Оффер${expired.length > 1 ? 'ы' : ''} истек${expired.length > 1 ? 'ли' : ''}: ${expired.map((o) => o.position).join(', ')}`);
  }

  // 8b. Mining farm (passive crypto income)
  const mining = miningSummary(state, content);
  if (mining) {
    if (mining.net >= 0) {
      state.money += mining.net;
      state.miningEarned = (state.miningEarned ?? 0) + mining.net;
      messages.push(`⛏ Ферма намайнила: +${fmtMoney(mining.net)} (электричество −${fmtMoney(mining.electricity)})`);
    } else if (state.money >= -mining.net) {
      state.money += mining.net;
      messages.push(`⛏ Курс упал: ферма ушла в минус на ${fmtMoney(-mining.net)}`);
    } else {
      state.money = 0;
      messages.push('⛏ Не хватило на электричество — ферма стояла весь день');
    }
  }

  // 9. Daily reset
  state.freelanceDoneToday = false;
  state.sideJobDoneToday = false;

  // 10. Recalc
  state.maxEnergy = recalcMaxEnergy(state, content);
  state.energy = Math.min(state.maxEnergy, state.energy + Math.floor(state.maxEnergy * 0.5));
  state.ratingScore = calculateRating(state);
}

function tryPromote(state: StoredState, company: any, messages: string[]) {
  const idx = careerLevelIndex(state.job!.grade);
  const next = GRADE_ORDER[idx + 1];
  if (!next || next === 'cto') return;

  const req = GRADE_REQUIREMENTS[next];
  const comm = state.softSkills['communication']?.level ?? 0;
  if (totalSkillLevels(state) < req.skill || comm < req.comm || state.reputation < req.rep) return;

  const salaryMult = company?.salaryMult ?? 1;
  const newSalary = Math.round((GRADE_SALARIES[next] * salaryMult) / 1000) * 1000;
  state.job = {
    ...state.job!,
    position: GRADE_POSITIONS[next],
    grade: next,
    salary: newSalary,
    daysSinceLastPromotion: 0,
  };
  state.grade = next;
  messages.push(`🚀 Повышение! Теперь ты ${GRADE_POSITIONS[next]} (${fmtMoney(newSalary)}/мес). Поздравляем, тебя ждёт ещё больше созвонов`);
}

function resolveInterview(state: StoredState, app: Application, content: any, messages: string[]) {
  const company = (content.companies as any[]).find((c: any) => c.id === app.companyId);
  if (!company) {
    state.currentApplication = null;
    return;
  }

  const skillLevels = Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level]));
  const communication = state.softSkills['communication']?.level ?? 0;
  const answerScore = 0.6 + rng() * 0.4; // mini-game result, 0.6..1.0

  const chance = interviewChance({
    skills: skillLevels,
    requirements: app.requirements,
    communication,
    reputation: state.reputation,
    companyBar: company.interviewBar ?? 1,
    answerScore,
  });

  const passed = rollInterview(chance, rng);

  if (passed) {
    const salary = Math.round((GRADE_SALARIES[app.grade] * (company.salaryMult ?? 1)) / 1000) * 1000;
    const offer: Offer = {
      companyId: company.id,
      position: app.position,
      grade: app.grade,
      salary,
      requirements: app.requirements,
      expiresInDays: 5,
      interviewBar: company.interviewBar ?? 1,
      companyToxicity: company.toxicity ?? 0,
    };
    state.pendingOffers = [...state.pendingOffers, offer];
    app.status = 'accepted';
    app.result = 'accepted';
    messages.push(`🎉 Собеседование в «${company.name}» пройдено! Оффер: ${app.position}, ${fmtMoney(salary)}/мес. Действует 5 дней — принять в «Карьере»`);
  } else {
    app.status = 'rejected';
    app.result = 'rejected';
    messages.push(`😔 «${company.name}»: мы впечатлены вашим резюме, но решили двигаться с другим кандидатом. Не расстраивайся — попробуй ещё раз через пару дней`);
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function maybeTriggerEvent(state: StoredState, content: any): GameEvent | null {
  // An unresolved event (action-triggered or chain) stays until resolved
  if (state.activeEventId) return null;

  // Pending chain events have absolute priority
  const dueIndex = state.pendingEvents.findIndex((e) => e.triggerDay <= state.currentDay);
  if (dueIndex >= 0) {
    const [due] = state.pendingEvents.splice(dueIndex, 1);
    const event = (content.events as any[]).find((e) => e.id === due.eventId);
    if (event) {
      state.activeEventId = event.id;
      return event;
    }
  }

  // Random event roll
  const chance = eventPhaseChance(content.balance, state.currentDay);
  if (rng() < chance) {
    const event = pickEvent(state, content.events, rng);
    if (event) {
      state.activeEventId = event.id;
      return event;
    }
  }

  return null;
}
