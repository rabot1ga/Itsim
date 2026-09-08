import { describe, it, expect } from 'vitest';
import { createNewPlayer } from '../player';
import {
  buildNewLife,
  canStartNewLife,
  metaXpMult,
  metaXpBonusPct,
  META_XP_PER_LIFE,
  META_XP_LIVES_CAP,
} from '../meta';
import { PlayerState } from '../../types';

/** A played run — something prestige is allowed on */
function playedRun(overrides: Partial<PlayerState> = {}): PlayerState {
  const base = createNewPlayer();
  return {
    ...base,
    currentDay: 120,
    grade: 'middle',
    money: 2_400_000,
    totalActions: 640,
    skills: { javascript: { level: 40, xp: 12 }, react: { level: 18, xp: 3 } },
    achievements: ['ach_money_100k', 'ach_day_100'],
    careerEnding: 'corporate_god',
    ...overrides,
  } as PlayerState;
}

describe('meta layer: availability', () => {
  it('a fresh player cannot start a new life yet', () => {
    expect(canStartNewLife(createNewPlayer())).toBe(false);
  });

  it('becomes available only after a career ending', () => {
    expect(canStartNewLife(playedRun())).toBe(true);
    expect(canStartNewLife(playedRun({ careerEnding: 'left_it' }))).toBe(true);
  });
});

describe('meta layer: XP multiplier', () => {
  it('first life has no bonus', () => {
    expect(metaXpMult(undefined)).toBe(1);
    expect(metaXpMult({ lives: 0, memories: [] })).toBe(1);
    expect(metaXpBonusPct(undefined)).toBe(0);
  });

  it('each completed life adds +15%', () => {
    expect(metaXpMult({ lives: 1, memories: ['corporate_god'] })).toBeCloseTo(1 + META_XP_PER_LIFE);
    expect(metaXpBonusPct({ lives: 2, memories: [] })).toBe(30);
  });

  it('caps the bonus at 5 lives — the game stays winnable forever', () => {
    for (let lives = 0; lives <= META_XP_LIVES_CAP + 3; lives++) {
      const mult = metaXpMult({ lives, memories: [] });
      expect(mult).toBeLessThanOrEqual(1 + META_XP_LIVES_CAP * META_XP_PER_LIFE);
    }
    expect(metaXpMult({ lives: 9, memories: [] })).toBe(1 + META_XP_LIVES_CAP * META_XP_PER_LIFE);
  });
});

describe('meta layer: buildNewLife', () => {
  it('fully resets the career but keeps the player identity', () => {
    const next = buildNewLife(playedRun());

    // career wiped
    expect(next.currentDay).toBe(1);
    expect(next.grade).toBe('unemployed');
    expect(next.money).toBe(10000);
    expect(next.skills).toEqual({});
    expect(next.job).toBeNull();
    expect(next.careerEnding).toBeUndefined();
    expect(next.achievements).toEqual(['ach_money_100k', 'ach_day_100']);

    // ledger updated
    expect(next.meta?.lives).toBe(1);
    expect(next.meta?.memories).toEqual(['corporate_god']);
    expect(next.meta?.bestGrade).toBe('middle');
    expect(next.meta?.deepestDay).toBe(120);
    expect(next.meta?.lifetimeActions).toBe(640);
  });

  it('second life stacks the ledger and appends a new memory', () => {
    const life1 = buildNewLife(playedRun());
    const later = playedRun({
      grade: 'architect',
      currentDay: 300,
      totalActions: 900,
      careerEnding: 'left_it',
      achievements: ['ach_money_100k', 'ach_day_100', 'ach_cto_run'],
      meta: life1.meta,
    });
    const life2 = buildNewLife(later);

    expect(life2.meta?.lives).toBe(2);
    expect(life2.meta?.memories).toEqual(['corporate_god', 'left_it']);
    expect(life2.meta?.bestGrade).toBe('architect');
    expect(life2.meta?.deepestDay).toBe(300);
    expect(life2.meta?.lifetimeActions).toBe(640 + 900);
    expect(metaXpBonusPct(life2.meta)).toBe(30);
  });

  it('does not duplicate the same ending in memories', () => {
    const life1 = buildNewLife(playedRun({ careerEnding: 'burnout' }));
    const again = buildNewLife(playedRun({ careerEnding: 'burnout', meta: life1.meta }));
    expect(again.meta?.lives).toBe(2);
    expect(again.meta?.memories).toEqual(['burnout']);
  });

  it('keeps check-in streak and Stars entitlements (bought by the person)', () => {
    const next = buildNewLife(
      playedRun({
        dailyStreak: 4,
        lastCheckInDate: '2026-09-08',
        entitlements: ['ent_room_neon'],
        badges: ['supporter'],
        walletAddress: '4X1...',
      })
    );
    expect(next.dailyStreak).toBe(4);
    expect(next.lastCheckInDate).toBe('2026-09-08');
    expect(next.entitlements).toEqual(['ent_room_neon']);
    expect(next.badges).toEqual(['supporter']);
    expect(next.walletAddress).toBe('4X1...');
  });

  it('bestGrade / deepestDay keep the all-time best across worse later lives', () => {
    const life1 = buildNewLife(playedRun({ grade: 'cto', currentDay: 400 }));
    const worse = buildNewLife(
      playedRun({ grade: 'intern', currentDay: 40, careerEnding: 'burnout', meta: life1.meta })
    );
    expect(worse.meta?.bestGrade).toBe('cto');
    expect(worse.meta?.deepestDay).toBe(400);
    expect(worse.meta?.lives).toBe(2);
  });

  it('meta survives on the state even when it was absent before', () => {
    const noMeta = playedRun();
    delete (noMeta as Partial<PlayerState>).meta;
    const next = buildNewLife(noMeta);
    expect(next.meta).toBeDefined();
    expect(next.meta?.lives).toBe(1);
    expect(next.meta?.memories).toEqual(['corporate_god']);
  });
});
