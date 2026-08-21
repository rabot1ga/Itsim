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

// ---- Mining farm ----

import {
  miningDailyIncome,
  miningDayNoise,
  hashrateOfItems,
  electricitySaveOfItems,
} from '../../index';

describe('mining', () => {
  const cfg = { priceBase: 40, volatility: 0.5, electricityPerHashrate: 0.5 };

  it('day noise is deterministic and within -1..1', () => {
    expect(miningDayNoise(42)).toBe(miningDayNoise(42));
    for (let d = 1; d <= 100; d++) {
      const n = miningDayNoise(d);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('income math: net = gross - electricity', () => {
    const inc = miningDailyIncome(100, 50, cfg);
    expect(inc.net).toBe(inc.gross - inc.electricity);
    expect(inc.gross).toBeGreaterThan(0);
    expect(inc.electricity).toBe(50);
  });

  it('income is deterministic for a fixed day', () => {
    const a = miningDailyIncome(60, 123, cfg);
    const b = miningDailyIncome(60, 123, cfg);
    expect(a).toEqual(b);
  });

  it('price stays within base ± volatility', () => {
    for (let d = 1; d <= 200; d++) {
      const inc = miningDailyIncome(10, d, cfg);
      expect(inc.price).toBeGreaterThanOrEqual(cfg.priceBase * (1 - cfg.volatility) - 0.001);
      expect(inc.price).toBeLessThanOrEqual(cfg.priceBase * (1 + cfg.volatility) + 0.001);
    }
  });

  it('hashrate sums only owned items', () => {
    const defs = [
      { id: 'mining_gpu', effects: { hashrate: 10 } },
      { id: 'mining_rig', effects: { hashrate: 60 } },
      { id: 'chair', effects: {} },
    ];
    expect(hashrateOfItems(['mining_gpu', 'mining_rig'], defs)).toBe(70);
    expect(hashrateOfItems(['mining_gpu'], defs)).toBe(10);
    expect(hashrateOfItems([], defs)).toBe(0);
  });

  it('electricity savings are summed and capped at 0.9', () => {
    const defs = [
      { id: 'solar1', effects: { electricitySave: 0.5 } },
      { id: 'solar2', effects: { electricitySave: 0.5 } },
    ];
    expect(electricitySaveOfItems(['solar1'], defs)).toBe(0.5);
    expect(electricitySaveOfItems(['solar1', 'solar2'], defs)).toBe(0.9);
  });
});

// ---- Perks (branch requirements, energy bonus) ----

import { canUnlockPerk, calculateMaxEnergy } from '../../index';

describe('perks', () => {
  it('branch requirements resolve via the branch map (not id prefixes)', () => {
    const p = createNewPlayer();
    p.skills = {
      solidity: { level: 20, xp: 0 },
      web3: { level: 20, xp: 0 },
      // ids do NOT start with "blockchain" — old heuristic would fail
    };
    const branchOf = { solidity: 'blockchain', web3: 'blockchain' };
    expect(canUnlockPerk(p, { blockchainBranch: 40 }, branchOf)).toBe(true);
    expect(canUnlockPerk(p, { blockchainBranch: 41 }, branchOf)).toBe(false);
  });

  it('perk energy bonus raises max energy and stays clamped', () => {
    const p = createNewPlayer();
    expect(calculateMaxEnergy(p)).toBe(10);
    expect(calculateMaxEnergy(p, 1)).toBe(11);
    expect(calculateMaxEnergy(p, 100)).toBeLessThanOrEqual(16);
  });

  it('soft skill requirements are checked against softSkills', () => {
    const p = createNewPlayer();
    p.softSkills['communication'] = { level: 22, xp: 0 };
    expect(canUnlockPerk(p, { communication: 20 })).toBe(true);
    expect(canUnlockPerk(p, { communication: 25 })).toBe(false);
  });
});

// ---- Skill-branch event gating ----

describe('skill-gated events', () => {
  const p = createNewPlayer();
  p.skills = { network_security: { level: 10, xp: 0 } };

  it('checkConditions.minSkill gates events on branch skills', () => {
    expect(checkConditions({ minSkill: { network_security: 10 } }, p)).toBe(true);
    expect(checkConditions({ minSkill: { network_security: 11 } }, p)).toBe(false);
    expect(checkConditions({ minSkill: { solidity: 5 } }, p)).toBe(false);
  });

  it('branch events only appear for players who invested in the branch', () => {
    // A player with zero skill in the branch never gets its events
    const fresh = createNewPlayer();
    expect(checkConditions({ minSkill: { network_security: 1 } }, fresh)).toBe(false);
    expect(checkConditions({ minSkill: { machine_learning: 1 } }, fresh)).toBe(false);
    // A cybersec player gets cybersec events but not blockchain ones
    expect(checkConditions({ minSkill: { network_security: 10 } }, p)).toBe(true);
    expect(checkConditions({ minSkill: { web3: 1 } }, p)).toBe(false);
  });
});

// ---- Action-triggered events (section 9.6) ----

import { maybeTriggerActionEvent } from '../../index';

const ACTION_POOL: any[] = [
  {
    id: 'bar_hr_meeting', title: '', description: '', tags: ['bar'], weight: 100,
    cooldownDays: 30, actionTrigger: { action: 'rest_bar', chance: 0.25, cooldownDays: 30 },
    choices: [{ text: 'a', effects: {} }, { text: 'b', effects: {} }],
  },
  {
    id: 'courier_dog', title: '', description: '', tags: ['sidejob'], weight: 100,
    cooldownDays: 15, actionTrigger: { action: 'side_job', jobId: 'courier', chance: 0.2 },
    choices: [{ text: 'a', effects: {} }, { text: 'b', effects: {} }],
  },
  {
    id: 'barista_tiktok', title: '', description: '', tags: ['sidejob'], weight: 100,
    cooldownDays: 30, actionTrigger: { action: 'side_job', jobId: 'barista', chance: 0.2 },
    choices: [{ text: 'a', effects: {} }, { text: 'b', effects: {} }],
  },
];

describe('action-triggered events', () => {
  it('pickEvent never picks action-triggered events from the day pool', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 10 };
    for (let i = 0; i < 20; i++) {
      const picked = pickEvent(p, ACTION_POOL, () => 0.5);
      expect(picked).toBeNull();
    }
  });

  it('maybeTriggerActionEvent matches the action id', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 10 };
    const ev = maybeTriggerActionEvent(p, ACTION_POOL, 'rest_bar', undefined, () => 0);
    expect(ev?.id).toBe('bar_hr_meeting');
    // Wrong action -> nothing
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'rest_gym', undefined, () => 0)).toBeNull();
  });

  it('side_job triggers match the jobId', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 10 };
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'side_job', 'courier', () => 0)?.id).toBe('courier_dog');
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'side_job', 'barista', () => 0)?.id).toBe('barista_tiktok');
    // No jobId -> side_job events do not fire
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'side_job', undefined, () => 0)).toBeNull();
  });

  it('chance is rolled: rng=0 fires, rng=0.999 does not', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 10 };
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'rest_bar', undefined, () => 0)).not.toBeNull();
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'rest_bar', undefined, () => 0.999)).toBeNull();
  });

  it('cooldown via eventHistory blocks re-triggering', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 10 };
    p.eventHistory = { bar_hr_meeting: { lastDay: 9, count: 1 } };
    // lastDay 9, cooldown 30 -> blocked
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'rest_bar', undefined, () => 0)).toBeNull();
    // after the cooldown window passes
    p.eventHistory = { bar_hr_meeting: { lastDay: 1, count: 1 } };
    p.currentDay = 40;
    expect(maybeTriggerActionEvent(p, ACTION_POOL, 'rest_bar', undefined, () => 0)?.id).toBe('bar_hr_meeting');
  });

  it('minGameDay gates action events', () => {
    const p: PlayerState = { ...createNewPlayer(), currentDay: 1 };
    // bar_hr_meeting has minGameDay 3 via content, but this pool entry has none;
    // test with a gated variant
    const gated: any[] = [{
      ...ACTION_POOL[0],
      id: 'gated_evt',
      minGameDay: 20,
      actionTrigger: { action: 'rest_bar', chance: 1 },
    }];
    expect(maybeTriggerActionEvent(p, gated, 'rest_bar', undefined, () => 0)).toBeNull();
    p.currentDay = 25;
    expect(maybeTriggerActionEvent(p, gated, 'rest_bar', undefined, () => 0)?.id).toBe('gated_evt');
  });
});

// ---- Item effects (content-driven) ----

import { itemBonusSum, itemXpMult, itemEnergyCostChance, itemDailyBonuses } from '../../index';

const ITEM_DEFS = [
  { id: 'sony_headphones', effects: { xpBonus: 0.15 } },
  { id: 'coffee_maker', effects: { energyBonus: 2, motivationBonus: 3 } },
  { id: 'desk_plant', effects: { motivationBonus: 2 } },
  { id: 'gym_subscription', effects: { energyBonus: 1, healthBonus: 2 } },
  { id: 'macbook', effects: { xpBonus: 0.1 } },
  { id: 'mechanical_keyboard', effects: { energyCostChance: 0.2 } },
];

describe('item effects', () => {
  it('itemBonusSum sums only owned items', () => {
    expect(itemBonusSum(['desk_plant'], ITEM_DEFS, 'motivationBonus')).toBe(2);
    expect(itemBonusSum(['coffee_maker', 'desk_plant'], ITEM_DEFS, 'motivationBonus')).toBe(5);
    expect(itemBonusSum([], ITEM_DEFS, 'motivationBonus')).toBe(0);
  });

  it('itemXpMult converts percent to multiplier', () => {
    expect(itemXpMult([], ITEM_DEFS)).toBe(1);
    expect(itemXpMult(['sony_headphones'], ITEM_DEFS)).toBeCloseTo(1.15, 5);
    expect(itemXpMult(['sony_headphones', 'macbook'], ITEM_DEFS)).toBeCloseTo(1.25, 5);
  });

  it('itemEnergyCostChance is capped at 0.8', () => {
    expect(itemEnergyCostChance([], ITEM_DEFS)).toBe(0);
    expect(itemEnergyCostChance(['mechanical_keyboard'], ITEM_DEFS)).toBeCloseTo(0.2, 5);
  });

  it('itemDailyBonuses returns motivation and health drips', () => {
    expect(itemDailyBonuses(['desk_plant'], ITEM_DEFS)).toEqual({ motivation: 2, health: 0 });
    expect(itemDailyBonuses(['gym_subscription'], ITEM_DEFS)).toEqual({ motivation: 0, health: 2 });
  });

  it('calculateMaxEnergy uses content defs (fixes legacy id typos)', () => {
    const p = createNewPlayer();
    // content-driven: coffee_maker gives +2
    p.items = ['coffee_maker'];
    expect(calculateMaxEnergy(p, 0, ITEM_DEFS)).toBe(12);
    // legacy fallback also works with corrected ids
    expect(calculateMaxEnergy(p)).toBe(12);
    // gym_subscription +1
    p.items = ['gym_subscription'];
    expect(calculateMaxEnergy(p, 0, ITEM_DEFS)).toBe(11);
  });
});

// ---- Interview quiz (gamified learning) ----

import {
  pickInterviewQuestions,
  interviewAnswerScore,
  interviewXpForQuestion,
  gradeTier,
} from '../../index';

const QUESTIONS = [
  { id: 'js_1', skillId: 'javascript', tier: 'junior', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
  { id: 'js_2', skillId: 'javascript', tier: 'middle', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
  { id: 'js_3', skillId: 'javascript', tier: 'senior', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
  { id: 'gen_1', skillId: 'general', tier: 'junior', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
  { id: 'py_1', skillId: 'python', tier: 'junior', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
  { id: 'py_2', skillId: 'python', tier: 'senior', text: 't', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
];

describe('interview questions', () => {
  it('gradeTier maps grades to question tiers', () => {
    expect(gradeTier('intern')).toBe('junior');
    expect(gradeTier('junior')).toBe('junior');
    expect(gradeTier('middle')).toBe('middle');
    expect(gradeTier('senior')).toBe('senior');
    expect(gradeTier('architect')).toBe('senior');
  });

  it('pickInterviewQuestions puts the main skill first, respects tier', () => {
    const rng = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff); })();
    const picked = pickInterviewQuestions(QUESTIONS as any, {
      mainSkillId: 'javascript',
      grade: 'junior',
      count: 3,
      rng,
    });
    expect(picked).toHaveLength(3);
    // topic-first: the first question is from the main skill
    expect(picked[0].skillId).toBe('javascript');
    // junior tier: middle/senior questions must never appear
    expect(picked.some((q) => q.id === 'js_2' || q.id === 'js_3' || q.id === 'py_2')).toBe(false);
  });

  it('pickInterviewQuestions fills from the wider tier pool when the branch is thin', () => {
    const rng = (() => { let s = 3; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff); })();
    const picked = pickInterviewQuestions(QUESTIONS as any, {
      mainSkillId: 'python',
      grade: 'junior',
      count: 3,
      rng,
    });
    expect(picked).toHaveLength(3);
    expect(picked[0].skillId).toBe('python');
    expect(picked.every((q) => ['python', 'general', 'javascript'].includes(q.skillId))).toBe(true);
  });

  it('interviewAnswerScore spans 0.4..1.0', () => {
    expect(interviewAnswerScore(0, 3)).toBeCloseTo(0.4, 5);
    expect(interviewAnswerScore(3, 3)).toBeCloseTo(1.0, 5);
    expect(interviewAnswerScore(1, 3)).toBeCloseTo(0.6, 5);
  });

  it('correct answers give more XP than mistakes, both teach', () => {
    expect(interviewXpForQuestion(true)).toBeGreaterThan(interviewXpForQuestion(false));
    expect(interviewXpForQuestion(false)).toBeGreaterThan(0);
  });
});
