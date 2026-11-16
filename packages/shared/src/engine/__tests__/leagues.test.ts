import { describe, expect, it } from 'vitest';
import {
  DIVISIONS,
  SEASON_FIGHTS,
  corpTourneyPrize,
  divisionOf,
  ensureLeague,
  itTourneyPrize,
  leagueOpponentPower,
  seasonOutcome,
  type LeagueState,
} from '../leagues';
import type { PlayerState } from '../../types';

/**
 * Лиги и турниры (DESIGN-PUNCH §5/§6): сезон из 5 матчей, очки 3/1,
 * повышение/понижение, титул; призы турниров растут от навыков и славы.
 */

const t = (k: string, o?: Record<string, unknown>) =>
  k.replace(/\{(\w+)\}/g, (_, key) => String(o?.[key as string] ?? `{${key}}`));

const league = (over: Partial<LeagueState> = {}): LeagueState => ({
  division: 'bronze',
  slot: 0,
  points: 0,
  wins: 0,
  losses: 0,
  season: 1,
  champion: false,
  ...over,
});

describe('ensureLeague', () => {
  it('создаёт мягкую дефолтную лигу и чинит битую', () => {
    const state = {} as PlayerState;
    expect(ensureLeague(state).division).toBe('bronze');
    state.league = { division: 'diamond' } as never;
    expect(ensureLeague(state).division).toBe('bronze');
    expect(SEASON_FIGHTS).toBe(5);
  });
});

describe('сила соперника лиги', () => {
  it('растёт с дивизионом и сезоном', () => {
    expect(leagueOpponentPower(league({ division: 'gold', season: 3 }))).toBeGreaterThan(
      leagueOpponentPower(league({ division: 'bronze', season: 1 }))
    );
  });
});

describe('seasonOutcome', () => {
  it('9 очков в бронзе — повышение в серебро', () => {
    const o = seasonOutcome(league({ points: 9 }), t);
    expect(o.promoted).toBe(true);
    expect(o.bonus).toBeGreaterThan(0);
  });

  it('3 очка при бронзе — без понижения (некуда)', () => {
    const o = seasonOutcome(league({ points: 3 }), t);
    expect(o.relegated).toBe(false);
  });

  it('3 очка в серебре — спуск в бронзу', () => {
    const o = seasonOutcome(league({ division: 'silver', points: 3 }), t);
    expect(o.relegated).toBe(true);
  });

  it('золото 12+ впервые — чемпионский пояс', () => {
    const o = seasonOutcome(league({ division: 'gold', points: 12 }), t);
    expect(o.title).toBe(true);
    expect(o.bonus).toBe(DIVISIONS[2].win * 2);
  });

  it('золото 12+ с поясом — титул защищён', () => {
    const o = seasonOutcome(league({ division: 'gold', points: 12, champion: true }), t);
    expect(o.title).toBe(false);
    expect(o.promoted).toBe(false);
  });

  it('divisionOf отдаёт нужный дивизион и падает в бронзу на мусоре', () => {
    expect(divisionOf('silver').label).toContain('Серебряная');
    expect(divisionOf('diamond' as never).id).toBe('bronze');
  });
});

describe('призы турниров', () => {
  it('IT-турнир: победа заметно щедрее поражения; слава растёт', () => {
    const win = itTourneyPrize(20, 10, true);
    const lose = itTourneyPrize(20, 10, false);
    expect(win.money).toBeGreaterThan(lose.money * 3);
    expect(win.fame).toBe(5);
  });

  it('корпоративный турнир: репутация и лидерство поднимают банк', () => {
    expect(corpTourneyPrize(80, 40, true).money).toBeGreaterThan(corpTourneyPrize(10, 5, true).money);
    expect(corpTourneyPrize(0, 0, false).rep).toBe(0);
  });
});
