/**
 * Сиквелы (DESIGN-LIVING-WORLD §4, стадия 3): «прошлое — не архив, а семя».
 *
 * Значимый акт или выбор события сажает затравку (`state.memorySeeds`) с
 * тегом и TTL; утро дня тянет созревшие затравки с приоритетом над случайными
 * событиями (но ниже сюжетных окон pendingEvents) и запускает событие-
 * продолжение с подходящим `sequelTag`.
 */

import type { MemorySeed, PlayerState, SeedWhen, SequelSeedSpec } from '../types';

/** Память не пухнет: ротация затравок. */
export const MAX_SEEDS = 12;
/** Дефолт: сколько дней затравка ждёт созревания после dueDay. */
export const SEED_TTL_DAYS = 4;

/**
 * Посадить затравку (идемпотентно по тегу: повтор заменяет даты, не плодит
 * дубли). `day` — текущий день.
 */
export function plantSeed(
  state: Pick<PlayerState, 'memorySeeds' | 'currentDay'>,
  spec: SequelSeedSpec & { day?: number }
): MemorySeed {
  const day = spec.day ?? state.currentDay ?? 1;
  const seed: MemorySeed = {
    tag: spec.tag,
    plantedDay: day,
    dueDay: day + spec.afterDays,
    expiresDay: day + spec.afterDays + (spec.ttlDays ?? SEED_TTL_DAYS),
    when: spec.when,
  };
  const rest = (state.memorySeeds ?? []).filter((s) => s.tag !== spec.tag);
  state.memorySeeds = [seed, ...rest].slice(0, MAX_SEEDS);
  return seed;
}

/** Условие созревания (§4): employed/jobless/minRelation. */
export function seedWhenPasses(state: PlayerState, when?: SeedWhen): boolean {
  if (!when) return true;
  if (when.employed && !state.job) return false;
  if (when.jobless && state.job) return false;
  if (when.minRelation) {
    for (const [npcId, need] of Object.entries(when.minRelation)) {
      if ((state.relationships?.[npcId] ?? 0) < need) return false;
    }
  }
  return true;
}

/** Созревшие затравки (dueDay наступил, TTL не истёк, условия выполнены). */
export function maturedSeeds(state: Pick<PlayerState, 'memorySeeds' | 'currentDay'> & PlayerState): MemorySeed[] {
  const day = state.currentDay ?? 1;
  return (state.memorySeeds ?? []).filter(
    (s) => s.dueDay <= day && day <= s.expiresDay && seedWhenPasses(state, s.when)
  );
}

/** Потребить затравку (сиквел сработал или её окно закрылось). */
export function consumeSeed(state: Pick<PlayerState, 'memorySeeds'>, tag: string): void {
  state.memorySeeds = (state.memorySeeds ?? []).filter((s) => s.tag !== tag);
}

/** Выкинуть протухшие затравки (TTL истёк) — вызывается при ротации утра. */
export function dropExpiredSeeds(state: Pick<PlayerState, 'memorySeeds' | 'currentDay'>): void {
  const day = state.currentDay ?? 1;
  state.memorySeeds = (state.memorySeeds ?? []).filter((s) => day <= s.expiresDay);
}
