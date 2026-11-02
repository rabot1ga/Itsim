import { describe, expect, it } from 'vitest';
import { applyEventEffects } from '../events';
import {
  MAX_SEEDS,
  SEED_TTL_DAYS,
  consumeSeed,
  dropExpiredSeeds,
  maturedSeeds,
  plantSeed,
  seedWhenPasses,
} from '../sequels';

/**
 * Сиквелы (DESIGN-LIVING-WORLD, стадия 3): прошлое — семя. Затравка сажается
 * актом/выбором, созревает к dueDay, живёт до expiresDay; утро тянет
 * созревшие с приоритетом над случайными событиями.
 */
const state = (over: Record<string, unknown> = {}) =>
  ({
    currentDay: 10,
    job: null,
    money: 0,
    energy: 10,
    maxEnergy: 16,
    health: 100,
    motivation: 50,
    reputation: 0,
    skills: {},
    softSkills: {},
    relationships: {},
    memorySeeds: [],
    ...over,
  }) as any;

describe('plantSeed', () => {
  it('сажает с датами и TTL по умолчанию', () => {
    const p = state();
    const s = plantSeed(p, { tag: 'client_returns', afterDays: 5 });
    expect(s.dueDay).toBe(15);
    expect(s.expiresDay).toBe(15 + SEED_TTL_DAYS);
    expect(p.memorySeeds).toHaveLength(1);
  });

  it('повтор по тегу заменяет, а не дублирует', () => {
    const p = state();
    plantSeed(p, { tag: 'x', afterDays: 5 });
    plantSeed(p, { tag: 'x', afterDays: 2 });
    expect(p.memorySeeds).toHaveLength(1);
    expect(p.memorySeeds[0].dueDay).toBe(12);
  });

  it('ротация по MAX_SEEDS', () => {
    const p = state();
    for (let i = 0; i < MAX_SEEDS + 4; i++) plantSeed(p, { tag: `s${i}`, afterDays: 3 });
    expect(p.memorySeeds).toHaveLength(MAX_SEEDS);
    expect(p.memorySeeds[0].tag).toBe(`s${MAX_SEEDS + 3}`);
  });
});

describe('seedWhenPasses', () => {
  it('employed/jobless', () => {
    expect(seedWhenPasses(state({ job: {} }), { employed: true })).toBe(true);
    expect(seedWhenPasses(state({ job: null }), { employed: true })).toBe(false);
    expect(seedWhenPasses(state({ job: null }), { jobless: true })).toBe(true);
    expect(seedWhenPasses(state({ job: {} }), { jobless: true })).toBe(false);
  });

  it('minRelation по нужному NPC', () => {
    const p = state({ relationships: { uni_friend: 42 } });
    expect(seedWhenPasses(p, { minRelation: { uni_friend: 40 } })).toBe(true);
    expect(seedWhenPasses(p, { minRelation: { uni_friend: 60 } })).toBe(false);
  });
});

describe('maturedSeeds / consumeSeed / dropExpiredSeeds', () => {
  it('окно созревания: dueDay..expiresDay', () => {
    const p = state();
    plantSeed(p, { tag: 'a', afterDays: 5 }); // due 15, expires 19
    expect(maturedSeeds(p)).toHaveLength(0);
    p.currentDay = 15;
    expect(maturedSeeds(p)).toHaveLength(1);
    p.currentDay = 19;
    expect(maturedSeeds(p)).toHaveLength(1);
    p.currentDay = 20;
    expect(maturedSeeds(p)).toHaveLength(0);
  });

  it('условия отсекают созревшие', () => {
    const p = state();
    plantSeed(p, { tag: 'a', afterDays: 0, when: { employed: true } });
    expect(maturedSeeds(p)).toHaveLength(0);
    p.job = { companyId: 'x' };
    expect(maturedSeeds(p)).toHaveLength(1);
  });

  it('consumeSeed снимает затравку; dropExpiredSeeds чистит протухшие', () => {
    const p = state();
    plantSeed(p, { tag: 'a', afterDays: 5 });
    plantSeed(p, { tag: 'b', afterDays: 20 });
    consumeSeed(p, 'a');
    expect(p.memorySeeds.map((s: any) => s.tag)).toEqual(['b']);
    dropExpiredSeeds(p); // b ещё жива
    expect(p.memorySeeds).toHaveLength(1);
    p.currentDay = 100;
    dropExpiredSeeds(p);
    expect(p.memorySeeds).toHaveLength(0);
  });
});

describe('applyEventEffects сажает затравку из выбора', () => {
  it('choice.sequel — семя в memorySeeds', () => {
    const p = state();
    const next = applyEventEffects(p, {
      text: 'Взяться',
      effects: { money: 100 },
      sequel: { tag: 'client_returns', afterDays: 4 },
    });
    expect(next.memorySeeds).toHaveLength(1);
    expect(next.memorySeeds[0].tag).toBe('client_returns');
    expect(next.money).toBe(100);
  });
});
