/**
 * Punch IT (DESIGN-PUNCH §2): статы, нужды, тайм-слоты.
 *
 * Три закона: время — валюта (слоты); билд решает бой (треугольник статов);
 * мир помнит бои (следы — DESIGN-LIVING-WORLD). Здесь — мир «до боя»:
 * тренировки, еда, отдых, работа, голод и слоты дня.
 */

import type { PlayerState, SkillLevel } from '../types';
import { applyXp } from './skills';

/** День = 5 слотов (закон 1). */
export const SLOTS_PER_DAY = 5;
/** Голод падает на N за каждый потраченный слот. */
export const HUNGER_PER_SLOT = 6;
/** Ночью голод падает ещё (сон не кормит). */
export const HUNGER_OVERNIGHT = 8;
/** Голод 0 → −здоровье за день. */
export const STARVATION_HEALTH_HIT = 4;
/** Мягкий старт сытости для старых сейвов. */
export const DEFAULT_HUNGER = 70;

export type StatId = 'power' | 'agility' | 'speed';

/** Тренировки (§2): каждая качает свой стат по-своему. */
export const TRAINING: Record<
  string,
  { stat: StatId; xp: number; hunger: number; energy: number; money: number; label: string }
> = {
  gym: { stat: 'power', xp: 26, hunger: HUNGER_PER_SLOT, energy: 3, money: 500, label: 'Штанга и жим' },
  run: { stat: 'agility', xp: 26, hunger: HUNGER_PER_SLOT, energy: 3, money: 0, label: 'Бег и скакалка' },
  bike: { stat: 'speed', xp: 26, hunger: HUNGER_PER_SLOT, energy: 3, money: 0, label: 'Велосипед' },
  spar: { stat: 'power', xp: 18, hunger: HUNGER_PER_SLOT + 2, energy: 4, money: 0, label: 'Спарринг' },
};

/** Еда (§2): три тира — сытость и настроение за деньги. */
export const FOOD: Record<string, { hunger: number; mood: number; money: number; label: string }> = {
  fast: { hunger: 28, mood: 0, money: 250, label: 'Фастфуд' },
  home: { hunger: 50, mood: 3, money: 700, label: 'Домашний обед' },
  restaurant: { hunger: 75, mood: 9, money: 2500, label: 'Ресторан' },
};

/** Отдых (§2): настроение и немного энергии. */
export const REST: Record<string, { mood: number; energy: number; money: number; label: string }> = {
  walk: { mood: 6, energy: 2, money: 0, label: 'Прогулка' },
  movie: { mood: 11, energy: 2, money: 600, label: 'Кино' },
  friends: { mood: 14, energy: 3, money: 400, label: 'Вечер с друзьями' },
};

/** Слоты «работы» и «заказа» (§4, арена 3 и фриланс). */
export const WORK_SLOTS = 2;
export const ORDER_SLOTS = 2;

type PunchState = Pick<PlayerState, 'combat' | 'hunger' | 'energy' | 'motivation' | 'money' | 'slotsUsed'>;

/** Боевой стат (SkillLevel-форма: level+xp) — ровно та же кривая, что у скиллов. */
export function stat(state: PunchState, id: StatId): SkillLevel {
  return state.combat?.[id] ?? { level: 5, xp: 0 };
}

/** Насколько есть статы (мягкая миграция старых сейвов). */
export function ensureCombat(state: Pick<PlayerState, 'combat'>): void {
  if (!state.combat || typeof state.combat !== 'object') state.combat = {} as never;
  const c = state.combat as Record<string, SkillLevel>;
  for (const id of ['power', 'agility', 'speed'] as const) {
    if (!c[id] || typeof c[id].level !== 'number') c[id] = { level: 5, xp: 0 };
  }
}

/** Осталось слотов сегодня. */
export function slotsLeft(state: Pick<PlayerState, 'slotsUsed'>): number {
  return Math.max(0, SLOTS_PER_DAY - (state.slotsUsed ?? 0));
}

/** Действие влезает в день? */
export function canSpendSlots(state: Pick<PlayerState, 'slotsUsed'>, slots: number): boolean {
  return slotsLeft(state) >= slots;
}

/**
 * Потратить слоты: голод падает пропорционально (закон 1). Вызывать только
 * после проверки canSpendSlots.
 */
export function spendSlots(state: PunchState, slots: number): void {
  state.slotsUsed = (state.slotsUsed ?? 0) + slots;
  state.hunger = Math.max(0, (state.hunger ?? DEFAULT_HUNGER) - HUNGER_PER_SLOT * slots);
}

/** Тренировка: +стат (мотивация множит XP), −сытость/−энергия уже учтены spendSlots. */
export function train(
  state: PunchState,
  activity: string
): { ok: true; stat: StatId; levelsUp: boolean } | { ok: false; error: 'slots' | 'money' | 'unknown' | 'energy' } {
  const def = TRAINING[activity];
  if (!def) return { ok: false, error: 'unknown' };
  if (!canSpendSlots(state, 1)) return { ok: false, error: 'slots' };
  if (state.money < def.money) return { ok: false, error: 'money' };
  if ((state.energy ?? 0) < def.energy) return { ok: false, error: 'energy' };
  spendSlots(state, 1);
  state.money -= def.money;
  state.energy = Math.max(0, (state.energy ?? 0) - def.energy);
  ensureCombat(state);
  const before = stat(state, def.stat);
  const next = applyXp(before, def.xp, state.motivation ?? 0);
  (state.combat as Record<string, SkillLevel>)[def.stat] = next;
  return { ok: true, stat: def.stat, levelsUp: next.level > before.level };
}

/** Еда: слот не тратит (перекус), но 1 раз за слот-окно контролирует сервер. */
export function eat(
  state: PunchState,
  tier: string
): { ok: true; hunger: number; mood: number } | { ok: false; error: 'money' | 'unknown' } {
  const def = FOOD[tier];
  if (!def) return { ok: false, error: 'unknown' };
  if (state.money < def.money) return { ok: false, error: 'money' };
  state.money -= def.money;
  state.hunger = Math.min(100, (state.hunger ?? DEFAULT_HUNGER) + def.hunger);
  if (def.mood) state.motivation = Math.min(100, (state.motivation ?? 0) + def.mood);
  return { ok: true, hunger: def.hunger, mood: def.mood };
}

/** Отдых: 1 слот, +настроение/энергия. */
export function rest(
  state: PunchState,
  activity: string
): { ok: true; mood: number; energy: number } | { ok: false; error: 'slots' | 'money' | 'unknown' } {
  const def = REST[activity];
  if (!def) return { ok: false, error: 'unknown' };
  if (!canSpendSlots(state, 1)) return { ok: false, error: 'slots' };
  if (state.money < def.money) return { ok: false, error: 'money' };
  spendSlots(state, 1);
  state.money -= def.money;
  state.motivation = Math.min(100, (state.motivation ?? 0) + def.mood);
  state.energy = (state.energy ?? 0) + def.energy;
  return { ok: true, mood: def.mood, energy: def.energy };
}

/** Ночь: голод падает, голодовка бьёт по здоровью (§2). */
export function overnight(state: PunchState & Pick<PlayerState, 'health'>): { starved: boolean } {
  state.hunger = Math.max(0, (state.hunger ?? DEFAULT_HUNGER) - HUNGER_OVERNIGHT);
  const starved = state.hunger <= 0;
  if (starved) state.health = Math.max(0, (state.health ?? 100) - STARVATION_HEALTH_HIT);
  return { starved };
}
