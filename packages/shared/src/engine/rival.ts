/**
 * Соперник (DESIGN-LIVING-WORLD §2/§4, стадия 2).
 *
 * Претендент на ту же ступень: появляется при найме, растёт каждый день,
 * давит на ревью через `competition` (разрыв виден игроку — закон 3 «память
 * видна»). События соперничества — редкие следы и карточка в стеке.
 */

import type { PlayerState, Rival } from '../types';

/** Пул имён соперников (RU — t() на границе рендера). */
export const RIVAL_NAMES = ['Марина', 'Артём', 'Кирилл', 'Вера', 'Тимур', 'Лена', 'Женя', 'Даша'] as const;

/**
 * «Запас» игрока — то, с чем сравнивается соперник: сумма уровней всех
 * навыков и софт-скиллов. Единица та же, что у `Rival.progress`.
 */
export function playerPower(state: Pick<PlayerState, 'skills' | 'softSkills'>): number {
  const hard = Object.values(state.skills ?? {}).reduce((s, v) => s + (v?.level ?? 0), 0);
  const soft = Object.values(state.softSkills ?? {}).reduce((s, v) => s + (v?.level ?? 0), 0);
  return hard + soft;
}

/** Создать соперника (идемпотентно: если уже есть — вернуть текущего). */
export function ensureRival(state: Pick<PlayerState, 'rival' | 'skills' | 'softSkills' | 'currentDay'>): Rival {
  if (state.rival) return state.rival;
  const day = state.currentDay ?? 1;
  // детерминированный выбор: имя от дня — ретро-сейвы воспроизводимы
  const name = RIVAL_NAMES[day % RIVAL_NAMES.length];
  const rival: Rival = {
    name,
    branch: 'main',
    // стартует рядом с игроком, чуть впереди или чуть позади
    progress: playerPower(state) + ((day % 5) - 2),
    day,
  };
  state.rival = rival;
  return rival;
}

/**
 * Дневной рост соперника. `rate` задаёт сервер (0.8–1.2 от темпа игрока) —
 * функция чистая и тестируемая без RNG.
 */
export function advanceRival(state: Pick<PlayerState, 'rival'>, rate: number): void {
  if (!state.rival) return;
  state.rival = { ...state.rival, progress: state.rival.progress + rate };
}

/** Разрыв: > 0 игрок впереди, < 0 соперник впереди. */
export function rivalGap(state: Pick<PlayerState, 'rival' | 'skills' | 'softSkills'>): number {
  if (!state.rival) return 0;
  return playerPower(state) - state.rival.progress;
}

/**
 * Давление соперника на ревью: добавка к `competition` в promotionChance.
 * Соперник впереди — до +0.6; игрок впереди — скидка до −0.3 (но не ниже нуля
 * со стороны соперника: игра не наказывает дважды).
 */
export function rivalPressure(state: Pick<PlayerState, 'rival' | 'skills' | 'softSkills'>): number {
  const gap = rivalGap(state);
  if (gap < 0) return Math.min(0.6, -gap * 0.06);
  return gap > 0 ? -Math.min(0.3, gap * 0.03) : 0;
}
