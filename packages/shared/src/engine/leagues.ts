/**
 * Лиги и турниры (DESIGN-PUNCH §5/§6, арены 2–3).
 *
 * Лига (арена 1, вечер боёв): сезон из 5 матчей, очки 3/1, итог сезона —
 * повышение/понижение; золото + решающий вечер → титул. IT-турниры и
 * корпоративные турниры — события выходного дня (2 слота), приз и слава.
 */

import type { PlayerState } from '../types';

export type Division = 'bronze' | 'silver' | 'gold';

/** Лиги (§5): бронза → серебро → золото → пояс. */
export const DIVISIONS: Array<{ id: Division; label: string; entry: number; win: number; need: number }> = [
  { id: 'bronze', label: 'Бронзовая лига', entry: 1000, win: 3000, need: 9 },
  { id: 'silver', label: 'Серебряная лига', entry: 3000, win: 8000, need: 10 },
  { id: 'gold', label: 'Золотая лига', entry: 6000, win: 18000, need: 12 },
];

export const SEASON_FIGHTS = 5;

export interface LeagueState {
  division: Division;
  /** Матчей в текущем сезоне сыграно (0..SEASON_FIGHTS). */
  slot: number;
  points: number;
  wins: number;
  losses: number;
  season: number;
  champion: boolean;
}

/** Сезон лиги (§5): мягкий дефолт — бронза, сезон 1. */
export function ensureLeague(state: PlayerState): LeagueState {
  if (!state.league || typeof state.league !== 'object' || !DIVISIONS.some((d) => d.id === state.league!.division)) {
    state.league = { division: 'bronze', slot: 0, points: 0, wins: 0, losses: 0, season: 1, champion: false };
  }
  return state.league;
}

export function divisionOf(id: Division): (typeof DIVISIONS)[number] {
  return DIVISIONS.find((d) => d.id === id) ?? DIVISIONS[0];
}

/** Соперник лиги: сила растёт с дивизионом и сезоном. */
export function leagueOpponentPower(league: LeagueState): number {
  const base = { bronze: 12, silver: 22, gold: 34 }[league.division];
  return base + league.season * 2 + league.slot * 2;
}

export interface SeasonOutcome {
  promoted: boolean;
  relegated: boolean;
  title: boolean;
  bonus: number;
  text: string;
}

/** Итог сезона: очки решают повышение/понижение; золото 12+ → титул. */
export function seasonOutcome(
  league: LeagueState,
  t: (k: string, o?: Record<string, unknown>) => string
): SeasonOutcome {
  const div = divisionOf(league.division);
  const idx = DIVISIONS.findIndex((d) => d.id === league.division);
  const outcome: SeasonOutcome = { promoted: false, relegated: false, title: false, bonus: 0, text: '' };
  if (league.points >= div.need) {
    if (idx < DIVISIONS.length - 1) {
      outcome.promoted = true;
      outcome.bonus = div.win;
      outcome.text = t('Переход в {p0}! Бонус: {p1}', { p0: DIVISIONS[idx + 1].label, p1: div.win });
    } else if (!league.champion) {
      outcome.title = true;
      outcome.bonus = div.win * 2;
      outcome.text = t('Чемпионский пояс твой! Бонус: {p1}', { p1: div.win * 2 });
    } else {
      outcome.bonus = div.win;
      outcome.text = t('Титул защищён. Бонус: {p1}', { p1: div.win });
    }
  } else if (league.points < 4 && idx > 0) {
    outcome.relegated = true;
    outcome.text = t('Сезон провален — спуск в {p0}', { p0: DIVISIONS[idx - 1].label });
  } else {
    outcome.text = t('Сезон окончен: {p0} очков — лига та же', { p0: league.points });
  }
  return outcome;
}

/** IT-турниры (арена 2, §6): формат по дню, приз растёт от уровня скилла. */
export const IT_FORMATS = [
  { id: 'duel', label: 'Код-дуэль', skill: 'backend' },
  { id: 'ctf', label: 'CTF-баттл', skill: 'security' },
  { id: 'hack', label: 'Хакатон', skill: 'product' },
] as const;

export function itTourneyPrize(mainLevel: number, fame: number, won: boolean): { money: number; fame: number } {
  const pool = 4000 + mainLevel * 600 + fame * 40;
  return won ? { money: Math.round(pool), fame: 5 } : { money: Math.round(pool * 0.15), fame: 1 };
}

/** Корпоративные турниры (арена 3, §6): репутация и лидерство решают. */
export function corpTourneyPrize(
  rep: number,
  leadership: number,
  won: boolean
): { money: number; fame: number; rep: number } {
  const pool = 6000 + rep * 120 + leadership * 250;
  return won ? { money: Math.round(pool), fame: 6, rep: 3 } : { money: Math.round(pool * 0.1), fame: 1, rep: 0 };
}
