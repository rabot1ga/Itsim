import { currentLocale, t } from '../../lib/i18n';
/**
 * Shared types and helpers for the `gameRoutes` family.
 *
 * `game.ts` (P1.14) was a 2.5k-line monolith. These utilities used to be
 * tucked inside it and are now extracted so the per-domain route files
 * (state / action / day / ending / archetype / interview / sprint / misc)
 * can compose them without circular imports.
 */
import { stripInternal } from '../../services/idempotency.js';
import {
  applySoftXp,
  calculateMaxEnergy,
  careerLevelIndex,
  ctoElectionChance,
  dailyCostBreakdown,
  electricitySaveOfItems,
  gateFor,
  gateProgress,
  GRADE_ORDER,
  GRADE_REQUIREMENTS,
  hashrateOfItems,
  HOUSING_COSTS,
  itemXpMult,
  metaXpMult,
  miningDailyIncome,
  nextGateOf,
  qualifiedGrade,
  reviewInterval,
  totalSkillLevels,
  weeklySalary,
  type CareerGate,
  type Grade,
  type PlayerState,
  seededRng,
  makeRngSalt,
} from '@itsim/shared';
/** The on-disk shape of the player's state (extends PlayerState with server-only fields) */
export type StoredState = PlayerState & {
  telegramId: string;
  lastTickAt: number;
  ratingScore: number;
  activeEventId: string | null;
  freelanceDoneToday: boolean;
  lastFreelanceDay: number;
  sideJobDoneToday: boolean;
  mainSkillId: string;
  petFedToday: boolean;
  networkingToday?: number;
  /** first day the player has been holding the savings cushion for the next flat */
  savingsSinceDay?: number;
  firstName: string;
  interviewSession?: {
    companyId: string;
    questions: Array<{
      id: string;
      chosen: number | null;
      correct: boolean | null;
    }>;
  };
};
/** Grade → human label. The shop and the office both lean on this map.
 *
 * Значения — сырые ключи словаря (без t() при загрузке модуля): сервер
 * долгоживущий, константы с t() замёрзли бы в языке старта (beta-gap).
 * Перевод — на границе: `translateDeep` для полей ответа, `t(label)` для
 * фрагментов внутри составных сообщений. */
export const GRADE_POSITIONS: Record<Grade, string> = {
  unemployed: 'Безработный',
  intern: 'Стажёр',
  junior: 'Junior-разработчик',
  middle: 'Middle-разработчик',
  senior: 'Senior-разработчик',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};
/** The default energy cost table for non-study actions. */
export const EXTRA_ENERGY_COSTS: Record<string, number> = {
  work_task: 4,
  work_overtime: 5,
  pet_project: 3,
  freelance: 3,
  rest_sleep: 0,
  rest_walk: 1,
  rest_lunch: 1,
  rest_bar: 2,
  rest_hobby: 1,
  rest_gym: 2,
  networking: 2,
  apply_job: 1,
  deliver_project: 0,
  drop_project: 0,
  cto_elect: 3,
  buy_item: 0,
  upgrade_housing: 0,
  accept_offer: 0,
  decline_offer: 0,
  cancel_application: 0,
  study_english: 2,
  study_english_course: 3,
  use_banked_day: 0,
  feed_pet: 1,
  spend_time_with_friend: 3,
  customize_room: 0,
  customize_avatar: 0,
  claim_ending: 0,
};
/**
 * Денежные цены действий (E4, ANALYSIS-2026-10-27). Единственная правда для
 * не-study действий: её читает `getActionMoneyCost`, её сверяет инвариант-тест
 * с каталогом клиента. study_* живут в `balance.xpSources`.
 */
export const ACTION_MONEY_COSTS: Record<string, number> = {
  rest_bar: 2000,
  rest_lunch: 700,
  rest_gym: 3000,
  study_english_course: 3000,
  feed_pet: 500,
};
/**
 * Серверный RNG баланса (P2.4, docs/PROPOSALS-2026-10-23-rng.md).
 *
 * Каждый бросок — `seededRng(telegramId:rngSalt:rngSeq++)`: клиент не влияет,
 * путь воспроизводим по сейву (соль секретна — `stripInternal` её режет),
 * повтор запроса не даёт «перебросить» — счётчик монотонен.
 */
export function rngStream(state: StoredState): () => number {
  if (typeof state.rngSalt !== 'string' || !state.rngSalt) state.rngSalt = makeRngSalt();
  if (typeof state.rngSeq !== 'number' || !Number.isFinite(state.rngSeq)) state.rngSeq = 0;
  return () => {
    const seq = state.rngSeq!++;
    return seededRng(`${state.telegramId}:${state.rngSalt}:${seq}`)();
  };
}
type RngFactory = (state: StoredState) => () => number;
let testRngFactory: RngFactory | null = null;
/** Тестовый сейм: задать поток бросков явно (вместо моков Math.random). */
export function __setRngFactoryForTests(factory: RngFactory | null): void {
  testRngFactory = factory;
}
// Фабрика с тестовым сеймом: прод всегда берёт rngStream.
export function balanceRng(state: StoredState): () => number {
  return (testRngFactory ?? rngStream)(state);
}
/**
 * Лимит на игровые мутации (античит сверх rate limit): 60/мин на пользователя
 * — с запасом для живого игрока (энергия и так режет дневной объём), но
 * жёсткий для скриптов. Срабатывание — 429 от @fastify/rate-limit.
 */
export const MUTATION_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;
/** Format rubles for human-readable output (1 230 ₽ / 12 тыс ₽ / 1.4 млн ₽).
 * Числа — через `Intl.*` под язык запроса (десят/групповые разделители). */
export function fmtMoney(amount: number): string {
  const tag = currentLocale() === 'en' ? 'en-US' : 'ru-RU';
  const num = (v: number, digits: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(v);
  if (amount >= 1000000) return t('{p0} млн ₽', { p0: num(amount / 1000000, 1) });
  if (amount >= 1000) return t('{p0} тыс ₽', { p0: num(amount / 1000, 0) });
  return `${num(amount, 0)} ₽`;
}
/** Human-friendly requirement keys used by career outlook + CTO election.
 *
 * Сырые ключи словаря (не t()): careerOutlook кладёт их в label — на
 * границе ответа их переведёт `translateDeep`; `{human}` в ending.ts
 * обрабатывает t() на месте сборки. */
export const HUMAN_REQ: Record<string, string> = {
  skill: 'основной навык',
  total: 'всего навыков',
  branchTotal: 'навыки в ветке',
  comm: 'коммуникация',
  english: 'английский',
  leadership: 'лидерство',
  rep: 'репутация',
};
/** Strip the answer from a question before sending it to the client. */
export function sanitizeInterviewQuestion(q: any) {
  return { id: q.id, skillId: q.skillId, tier: q.tier, text: q.text, options: q.options };
}
/** Probability of an event rolling on a given day (curved by career phase). */
export function eventPhaseChance(balance: any, day: number): number {
  if (day <= 10) return balance.eventChanceOnboarding ?? 0.2;
  if (day <= 30) return balance.eventChanceEarly ?? 0.35;
  if (day <= 150) return balance.eventChanceMid ?? 0.28;
  return balance.eventChanceLate ?? 0.2;
}
/** Attach the UI message to the response state. */
export function respondState(state: StoredState, message?: string) {
  return { ...stripInternal(state), _lastEvent: message };
}
/** Flat skill → level map (archetype progress is derived from these). */
export function skillLevelMap(state: StoredState): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [id, v] of Object.entries(state.skills ?? {})) {
    map[id] =
      (
        v as
          | {
              level?: number;
            }
          | undefined
      )?.level ?? 0;
  }
  return map;
}
/**
 * Career gates: content-driven (balance.careerGates) with a graceful fallback to
 * the built-in table so an old content bundle still boots.
 */
export function careerGatesOf(content: any): CareerGate[] {
  const fromContent = content.balance?.careerGates as CareerGate[] | undefined;
  if (fromContent?.length) return fromContent;
  // Fallback: derive the legacy table into the new shape
  return GRADE_ORDER.filter((g) => g !== 'unemployed').map((grade) => ({
    grade,
    skill: GRADE_REQUIREMENTS[grade].skill,
    total: 0,
    comm: GRADE_REQUIREMENTS[grade].comm,
    rep: GRADE_REQUIREMENTS[grade].rep,
    minDaysInGrade: 7,
    competition: 1,
    special: grade === 'cto',
  }));
}
const branchMapCache = new Map<string, Record<string, string>>();
/** Map of skill id → branch name, derived from the loaded content. */
export function branchOfMap(content: any): Record<string, string> {
  const key = `${(content.skills as any[])?.length ?? 0}:${(content.skills as any[])?.[0]?.id ?? ''}`;
  const cached = branchMapCache.get(key);
  if (cached) return cached;
  const map: Record<string, string> = {};
  for (const skill of (content.skills ?? []) as any[]) {
    if (skill.id && skill.branch) map[skill.id] = skill.branch;
  }
  branchMapCache.set(key, map);
  return map;
}
/**
 * Monthly recurring costs granted by owned items (gym subscription, internet, ...).
 * Content-driven: an item with effects.monthlyCost is a subscription, not a purchase.
 */
export function monthlySubscriptions(state: StoredState, content: any): number {
  let total = 0;
  for (const item of (content.items ?? []) as any[]) {
    if (state.items.includes(item.id) && item.effects?.monthlyCost) {
      total += item.effects.monthlyCost;
    }
  }
  return total;
}
/** Soft-skill tuning from content (saturation keeps people skills un-farmable) */
export function softOpts(content: any) {
  const cfg = content.balance?.softSkills ?? { saturatesAt: 30, xpDamping: 0.5 };
  return { saturatesAt: cfg.saturatesAt ?? 30, damping: cfg.xpDamping ?? 0.5 };
}
/** What the next promotion actually needs — the late game should be legible. */
export function careerOutlook(state: StoredState, content: any) {
  const gates = careerGatesOf(content);
  const branchOf = branchOfMap(content);
  const next = nextGateOf(gates, state.grade);
  if (!next) {
    const cto = gateFor(gates, 'cto');
    if (cto && state.grade === 'architect') {
      const { chance, qualified, missing } = ctoElectionChance(state, cto);
      return {
        kind: 'cto_election',
        label: t('Выборы CTO'),
        ready: qualified,
        chance: Math.round(chance * 100),
        cooldownDays: Math.max(0, (state.ctoCooldownUntilDay ?? 0) - state.currentDay),
        missing: Object.entries(missing).map(([k, v]) => ({ key: k, label: HUMAN_REQ[k] ?? k, ...v })),
      };
    }
    return { kind: 'top', label: t('Вы на вершине лестницы') };
  }
  const progress = gateProgress(state, next, { branchOf });
  const interval = reviewInterval(gates, state.grade);
  const since = state.job ? (state.job.daysSinceLastPromotion ?? 0) : 0;
  return {
    kind: 'promotion',
    grade: next.grade,
    label: next.label ?? next.grade,
    ready: progress.ok,
    progress: Math.round(progress.progress * 100),
    daysToReview: Math.max(0, interval - since),
    reviewInterval: interval,
    competition: next.competition ?? 1,
    missing: Object.entries(progress.missing).map(([k, v]) => ({ key: k, label: HUMAN_REQ[k] ?? k, ...v })),
  };
}
/**
 * Daily money pressure summary: «твой день стоит X ₽». This is what makes the
 * late game a decision and not a spreadsheet with growing numbers.
 */
export function costOfDay(state: StoredState, content: any) {
  const living = content.balance?.livingCosts;
  if (!living) return null;
  const breakdown = dailyCostBreakdown(state, living, {
    subscriptionsMonthly: monthlySubscriptions(state, content),
    rentMonthly: HOUSING_COSTS[state.housingLevel] ?? 0,
  });
  const weekly = state.job ? weeklySalary(state.job.salary) : 0;
  return {
    ...breakdown,
    incomeDaily: Math.round(weekly / 7),
    balanceDaily: Math.round(weekly / 7) - breakdown.daily - breakdown.rent - breakdown.wealthTax,
  };
}
/** Highest grade the player currently qualifies for (depth + breadth + soft skills) */
export function targetGrade(state: StoredState, content: any): Grade | null {
  const discount = Math.min(0.5, perkEffectSum(state, content, 'jobRequirementDiscount'));
  const legacy = careerGatesOf(content).length === 0;
  if (legacy) {
    let best: Grade | null = null;
    const comm = state.softSkills['communication']?.level ?? 0;
    for (const grade of GRADE_ORDER) {
      if (grade === 'unemployed' || grade === 'cto') continue;
      const req = GRADE_REQUIREMENTS[grade];
      if (totalSkillLevels(state) >= req.skill * (1 - discount) && comm >= req.comm && state.reputation >= req.rep) {
        best = grade;
      }
    }
    return best;
  }
  return qualifiedGrade(state, careerGatesOf(content), { branchOf: branchOfMap(content), discount });
}
/** Sum a numeric perk effect across all owned perks */
export function perkEffectSum(state: StoredState, content: any, effectKey: string): number {
  let total = 0;
  for (const perk of content.perks as any[]) {
    if (state.perks.includes(perk.id) && perk.effects?.[effectKey]) {
      total += perk.effects[effectKey];
    }
  }
  return total;
}
/** Total energy bonus from owned perks */
export function perkEnergyBonus(state: StoredState, content: any): number {
  return perkEffectSum(state, content, 'energyBonus');
}
/** Recalculate max energy including owned perk bonuses */
/**
 * Seed NPC starting relationships for keys the player has never touched
 * (ANALYSIS-2026-10-27 §2.1: `initialRelation` из npcs.json раньше жил только
 * в клиентском фолбэке — сервер считал от нуля, и чип «Друг +40» превращался
 * в «Знакомый +8» после первого совместного вечера). Заполняем только
 * отсутствующие ключи: любое уже записанное отношение священно.
 */
export function seedRelationships(state: StoredState, content: any): void {
  const npcs = (content.npcs ?? []) as any[];
  for (const npc of npcs) {
    if (state.relationships[npc.id] === undefined && typeof npc.initialRelation === 'number') {
      state.relationships[npc.id] = npc.initialRelation;
    }
  }
}
export function recalcMaxEnergy(state: StoredState, content: any): number {
  return calculateMaxEnergy(state, perkEnergyBonus(state, content), content.items);
}
/** Effective motivation for XP gains (learning perks boost it) */
export function xpMotivation(state: StoredState, content: any): number {
  const learning = perkEffectSum(state, content, 'learningBonus');
  return state.motivation + Math.round(learning / 0.006); // 0.15 → +25
}
/** Raw XP multiplied by owned item bonuses (headphones, macbook, ...) */
export function xpGain(state: StoredState, content: any, base: number): number {
  return Math.round(base * itemXpMult(state.items, content.items) * metaXpMult(state.meta));
}
/** Soft-XP gain convenience used across the action set */
export { applySoftXp, hashrateOfItems, careerLevelIndex };
/** Re-exports of helpers that several route files need together */
export {
  branchShareXp,
  GRADE_ENERGY,
  GRADE_REQUIREMENTS,
  HOUSING_COSTS,
  HOUSING_NAMES,
  weeklySalary,
} from '@itsim/shared';
/**
 * Server-only helpers that used to live in `game.ts` and are reused by
 * `state.ts` and `sprint.ts` (the two routes that render the "first paint"
 * payload).
 */
export { resetDailyChallenge, sprintView } from './_day.js';
/** Mining summary for the current state (null when no hardware) */
export function miningSummary(state: StoredState, content: any) {
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
