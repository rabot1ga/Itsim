import { describe, it, expect } from 'vitest';
import {
  clamp,
  weightedPick,
  generateId,
  xpToNext,
  applyXp,
  applySoftXp,
  motivationMult,
  weeklySalary,
  freelancePayment,
  applyMotivationDrift,
  HOUSING_COSTS,
  calculateMaxEnergy,
  calculateOfflineBankedDays,
  advanceLastTick,
  interviewChance,
  rollInterview,
  preScreenMatch,
  calculateRating,
  checkConditions,
  pickEvent,
  applyEventEffects,
  checkAchievements,
  createNewPlayer,
  totalSkillLevels,
  careerLevelIndex,
  GRADE_ORDER,
  type PlayerState,
} from '../../index';

const THREE_POINT_FIVE_HOURS = 3.5 * 3600 * 1000;

describe('utils', () => {
  it('clamp limits values', () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(42, 0, 100)).toBe(42);
  });

  it('weightedPick respects weights', () => {
    const rng = () => 0.99;
    const picked = weightedPick(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 9 },
      ],
      rng
    );
    expect(picked?.id).toBe('b');
  });

  it('weightedPick returns null for empty/zero-weight pools', () => {
    expect(weightedPick([], () => 0)).toBeNull();
    expect(weightedPick([{ id: 'a', weight: 0 }], () => 0)).toBeNull();
  });

  it('generateId returns a UUID', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('skills', () => {
  it('xpToNext is positive and grows with level', () => {
    expect(xpToNext(0)).toBeGreaterThan(0);
    for (let l = 0; l < 50; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThanOrEqual(xpToNext(l));
    }
  });

  it('applyXp levels up when enough XP accumulates', () => {
    const result = applyXp({ level: 0, xp: 0 }, xpToNext(0) + xpToNext(1), 50);
    expect(result.level).toBe(2);
  });

  it('motivationMult stays within 0.7..1.3', () => {
    expect(motivationMult(0)).toBeCloseTo(0.7, 5);
    expect(motivationMult(100)).toBeCloseTo(1.3, 5);
    expect(motivationMult(50)).toBeCloseTo(1.0, 5);
  });

  it('applySoftXp uses the same leveling curve', () => {
    const result = applySoftXp({ level: 0, xp: 0 }, xpToNext(0) + 1);
    expect(result.level).toBe(1);
  });
});

describe('economy', () => {
  it('weeklySalary divides monthly by 4.3', () => {
    expect(weeklySalary(90000)).toBe(Math.round(90000 / 4.3));
  });

  it('freelancePayment grows with skill, reputation and difficulty', () => {
    const easy = freelancePayment(20, 0, 'easy');
    const medium = freelancePayment(20, 0, 'medium');
    const hard = freelancePayment(20, 0, 'hard');
    const highSkill = freelancePayment(80, 0, 'easy');
    const highRep = freelancePayment(20, 50, 'easy');
    expect(medium).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(medium);
    expect(highSkill).toBeGreaterThan(easy);
    expect(highRep).toBeGreaterThan(easy);
  });

  it('motivation drift reduces motivation daily and respects the health cap', () => {
    const { motivation } = applyMotivationDrift(95, 80, false, 0);
    // health cap: 40 + 80 * 0.6 = 88
    expect(motivation).toBeLessThanOrEqual(88);
  });

  it('housing costs are defined for levels 0..4', () => {
    for (let l = 0; l <= 4; l++) {
      expect(HOUSING_COSTS[l]).toBeGreaterThan(0);
    }
  });
});

describe('energy', () => {
  it('new player has max energy 10', () => {
    const p = createNewPlayer();
    expect(calculateMaxEnergy(p)).toBe(10);
  });

  it('high health grants a bonus', () => {
    const p = createNewPlayer();
    p.health = 90;
    expect(calculateMaxEnergy(p)).toBeGreaterThan(10);
  });

  it('housing upgrades grant energy', () => {
    const p = createNewPlayer();
    p.housingLevel = 1;
    expect(calculateMaxEnergy(p)).toBe(11);
  });

  it('energy never drops below the minimum', () => {
    const p = createNewPlayer();
    p.health = 0;
    p.motivation = 0;
    expect(calculateMaxEnergy(p)).toBeGreaterThanOrEqual(3);
  });

  it('offline banking: 3.5 hours = 1 day, capped at 7', () => {
    const now = Date.now();
    expect(calculateOfflineBankedDays(now - THREE_POINT_FIVE_HOURS, now)).toBe(1);
    expect(calculateOfflineBankedDays(now - THREE_POINT_FIVE_HOURS * 30, now)).toBe(7);
  });

  it('advanceLastTick keeps the remainder', () => {
    const now = Date.now();
    const lastTick = now - THREE_POINT_FIVE_HOURS * 2 - 1000;
    const advanced = advanceLastTick(lastTick, 2);
    expect(calculateOfflineBankedDays(advanced, now)).toBe(0);
  });
});

describe('interview', () => {
  it('chance is always within 5..95', () => {
    const base = {
      communication: 10,
      reputation: 0,
      companyBar: 1.0,
      answerScore: 0.8,
    };
    expect(interviewChance({ skills: { js: 1 }, requirements: { js: 10 }, ...base })).toBeGreaterThanOrEqual(5);
    expect(interviewChance({ skills: { js: 100 }, requirements: { js: 1 }, ...base })).toBeLessThanOrEqual(95);
  });

  it('hard skill miss (ratio < 0.5) heavily reduces the chance', () => {
    const good = interviewChance({
      skills: { js: 10 }, requirements: { js: 10 }, communication: 10, reputation: 0, companyBar: 1, answerScore: 0.8,
    });
    const bad = interviewChance({
      skills: { js: 4 }, requirements: { js: 10 }, communication: 10, reputation: 0, companyBar: 1, answerScore: 0.8,
    });
    expect(bad).toBeLessThan(good);
  });

  it('rollInterview is deterministic with a fixed RNG', () => {
    expect(rollInterview(100, () => 0.5)).toBe(true);
    expect(rollInterview(0, () => 0.5)).toBe(false);
  });

  it('preScreenMatch returns 1 for perfect match', () => {
    expect(preScreenMatch({ js: 20 }, { js: 20 })).toBe(1);
  });
});

describe('rating', () => {
  it('rating is always in 0..1000', () => {
    const p = createNewPlayer();
    expect(calculateRating(p)).toBeGreaterThanOrEqual(0);
    expect(calculateRating(p)).toBeLessThanOrEqual(1000);

    p.money = 100000000;
    p.grade = 'architect';
    p.reputation = 100;
    p.housingLevel = 4;
    expect(calculateRating(p)).toBeLessThanOrEqual(1000);
  });

  it('grade order matches career ladder', () => {
    expect(careerLevelIndex('intern')).toBe(1);
    expect(careerLevelIndex('architect')).toBe(6);
    expect(GRADE_ORDER[0]).toBe('unemployed');
  });
});

describe('events', () => {
  const basePlayer = createNewPlayer();

  it('checkConditions handles hasJob', () => {
    expect(checkConditions({ hasJob: false }, basePlayer)).toBe(true);
    expect(checkConditions({ hasJob: true }, basePlayer)).toBe(false);
  });

  it('pickEvent prioritizes pending chain events', () => {
    const p: PlayerState = {
      ...basePlayer,
      currentDay: 10,
      pendingEvents: [{ eventId: 'chain_evt', triggerDay: 9 }],
    };
    const pool = [
      { id: 'chain_evt', title: '', description: '', tags: [], weight: 1, cooldownDays: 0, choices: [] },
      { id: 'other', title: '', description: '', tags: [], weight: 100, cooldownDays: 0, choices: [] },
    ];
    const picked = pickEvent(p, pool as any, () => 0.99);
    expect(picked?.id).toBe('chain_evt');
  });

  it('pickEvent never picks chain-only events from the random pool', () => {
    const p: PlayerState = { ...basePlayer, currentDay: 10 };
    const pool = [
      {
        id: 'chain_only', title: '', description: '', tags: [],
        weight: 100, cooldownDays: 0, chainOnly: true,
        choices: [
          { text: 'a', effects: {} },
          { text: 'b', effects: {} },
        ],
      },
      {
        id: 'normal', title: '', description: '', tags: [],
        weight: 1, cooldownDays: 0,
        choices: [
          { text: 'a', effects: {} },
          { text: 'b', effects: {} },
        ],
      },
    ];
    for (let i = 0; i < 20; i++) {
      const picked = pickEvent(p, pool as any, () => 0.99);
      expect(picked?.id).toBe('normal');
    }
  });

  it('applyEventEffects clamps resources and levels skills via XP', () => {
    const p = { ...basePlayer };
    const updated = applyEventEffects(p, {
      text: 't',
      effects: { energy: 50, health: -500, money: -100, reputation: 1000, skill: { javascript: xpToNext(0) + 5 } },
    });
    // original is not mutated
    expect(p.energy).toBe(10);
    expect(updated.energy).toBeLessThanOrEqual(updated.maxEnergy);
    expect(updated.health).toBe(0);
    expect(updated.money).toBe(9900);
    expect(updated.reputation).toBe(100);
    expect(updated.skills.javascript.level).toBeGreaterThanOrEqual(1);
  });
});

describe('achievements', () => {
  it('awards grade achievements once', () => {
    const p = createNewPlayer();
    p.grade = 'junior';
    const defs = [
      { id: 'a1', name: '', description: '', icon: '', condition: { type: 'grade_reached', target: 'junior' } as const },
      { id: 'a2', name: '', description: '', icon: '', condition: { type: 'money_made', target: 999999999 } as const },
    ];
    const earned = checkAchievements(p, defs as any);
    expect(earned.map((e) => e.id)).toEqual(['a1']);
    expect(p.achievements).toContain('a1');
    // second run awards nothing new
    expect(checkAchievements(p, defs as any)).toEqual([]);
  });

  it('events_seen counts total event occurrences', () => {
    const p = createNewPlayer();
    p.eventHistory = { e1: { lastDay: 1, count: 3 }, e2: { lastDay: 2, count: 2 } };
    const defs = [
      { id: 'ev', name: '', description: '', icon: '', condition: { type: 'events_seen', target: 5 } as const },
    ];
    expect(checkAchievements(p, defs as any).map((e) => e.id)).toEqual(['ev']);
  });
});

describe('player', () => {
  it('new player starts with sensible defaults', () => {
    const p = createNewPlayer();
    expect(p.currentDay).toBe(1);
    expect(p.grade).toBe('unemployed');
    expect(p.money).toBe(10000);
    expect(p.job).toBeNull();
    expect(totalSkillLevels(p)).toBe(0);
  });
});

// ---- Procedural genetics (DESIGN.md) ----

import {
  generatePlayerSeed,
  seededRng,
  seededWeightedPick,
  getGeneticTraits,
  tintFilter,
  traitTint,
  type GeneticsConfig,
} from '../../index';

const GENETICS_CONFIG: GeneticsConfig = {
  eyes: [
    { id: 'eye_normal', name: 'Обычные', weight: 50 },
    { id: 'eye_tired', name: 'Уставшие', weight: 25 },
    { id: 'eye_legendary', name: 'Глаза Сеньора', weight: 5, rarity: 'legendary' },
  ],
  hairstyles: [
    { id: 'hair_bald', name: 'Лысый', weight: 10 },
    { id: 'hair_messy', name: 'Взъерошенные', weight: 40 },
    { id: 'hair_manbun', name: 'Пучок', weight: 15 },
  ],
  hairPalette: [
    { id: 'hair_black', name: 'Чёрный', hue: 20, sat: 0.6, light: 0.55 },
    { id: 'hair_blond', name: 'Блонд', hue: 48, sat: 2.0, light: 1.25 },
  ],
  skinTones: [
    { id: 'skin_pale', name: 'Бледный', hue: 25, sat: 1.4, light: 1.1 },
    { id: 'skin_dark', name: 'Тёмный', hue: 15, sat: 2.2, light: 0.6 },
  ],
  beards: [
    { id: 'beard_none', name: 'Без бороды', weight: 45 },
    { id: 'beard_full', name: 'Борода', weight: 20 },
  ],
  tops: [
    { id: 'top_hoddie', name: 'Худи', weight: 50 },
    { id: 'top_tshirt', name: 'Футболка', weight: 30 },
  ],
  accessories: [
    { id: 'acc_none', name: 'Без аксессуаров', weight: 40 },
    { id: 'acc_headphones', name: 'Наушники', weight: 20 },
  ],
  windows: [
    { id: 'window_square', name: 'Квадратное', weight: 40 },
    { id: 'window_round', name: 'Круглое', weight: 10 },
  ],
  wallPalette: [
    { id: 'wall_gray', name: 'Серый', hue: 0, sat: 0.2, light: 0.9 },
    { id: 'wall_blue', name: 'Синий', hue: 210, sat: 1.6, light: 0.95 },
  ],
  decorOptions: [
    { id: 'decor_poster_js', name: 'Постер JS', weight: 30 },
    { id: 'decor_neon', name: 'Неон', weight: 10 },
  ],
};

describe('genetics', () => {
  it('generates a 64-hex-char sha256 seed', () => {
    const seed = generatePlayerSeed('wallet123', 'game-1');
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different wallets produce different seeds', () => {
    expect(generatePlayerSeed('walletA')).not.toBe(generatePlayerSeed('walletB'));
  });

  it('seededRng is deterministic for the same seed', () => {
    const r1 = seededRng('seed-1');
    const r2 = seededRng('seed-1');
    for (let i = 0; i < 20; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it('seededWeightedPick respects weights (deterministic)', () => {
    const items = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 99 },
    ];
    let picks = 0;
    for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      if (seededWeightedPick(items, s, 'x').id === 'b') picks++;
    }
    expect(picks).toBeGreaterThan(5); // statistical sanity, deterministic
  });

  it('getGeneticTraits is deterministic for a fixed seed', () => {
    const seed = generatePlayerSeed('wallet-determinism');
    const t1 = getGeneticTraits(seed, GENETICS_CONFIG);
    const t2 = getGeneticTraits(seed, GENETICS_CONFIG);
    expect(t1).toEqual(t2);
    expect(t1.seed).toBe(seed);
  });

  it('traits always reference existing options', () => {
    const seed = generatePlayerSeed('wallet-validity');
    const t = getGeneticTraits(seed, GENETICS_CONFIG);
    const ids = (opts: { id: string }[]) => new Set(opts.map((o) => o.id));
    expect(ids(GENETICS_CONFIG.eyes).has(t.eyeShape)).toBe(true);
    expect(ids(GENETICS_CONFIG.hairstyles).has(t.hairStyle)).toBe(true);
    expect(ids(GENETICS_CONFIG.hairPalette).has(t.hairColor)).toBe(true);
    expect(ids(GENETICS_CONFIG.skinTones).has(t.skinTone)).toBe(true);
    expect(ids(GENETICS_CONFIG.windows).has(t.windowShape)).toBe(true);
    expect(ids(GENETICS_CONFIG.wallPalette).has(t.wallColor)).toBe(true);
    expect(ids(GENETICS_CONFIG.decorOptions).has(t.decor)).toBe(true);
  });

  it('tintFilter produces a CSS filter string with the hue', () => {
    const filter = tintFilter({ id: 'x', name: 'x', hue: 210, sat: 1.5, light: 1.2 });
    expect(filter).toContain('hue-rotate(210deg)');
    expect(filter).toContain('saturate(1.5)');
    expect(filter).toContain('brightness(1.2)');
  });

  it('traitTint resolves palettes per slot', () => {
    const seed = generatePlayerSeed('wallet-tint');
    const t = getGeneticTraits(seed, GENETICS_CONFIG);
    expect(traitTint('skinTone', t, GENETICS_CONFIG)?.id).toBe(t.skinTone);
    expect(traitTint('wallColor', t, GENETICS_CONFIG)?.id).toBe(t.wallColor);
    expect(traitTint('unknownSlot', t, GENETICS_CONFIG)).toBeNull();
  });
});
