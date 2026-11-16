import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HUNGER,
  HUNGER_OVERNIGHT,
  SLOTS_PER_DAY,
  STARVATION_HEALTH_HIT,
  canSpendSlots,
  eat,
  ensureCombat,
  overnight,
  rest,
  slotsLeft,
  spendSlots,
  stat,
  train,
} from '../punch';

/**
 * Punch IT (DESIGN-PUNCH §2): слоты — валюта времени; голод — нужда;
 * треугольник статов растёт тренировками.
 */
const state = (over: Record<string, unknown> = {}) =>
  ({
    money: 5000,
    energy: 10,
    maxEnergy: 16,
    motivation: 60,
    health: 90,
    hunger: DEFAULT_HUNGER,
    slotsUsed: 0,
    combat: { power: { level: 5, xp: 0 }, agility: { level: 5, xp: 0 }, speed: { level: 5, xp: 0 } },
    ...over,
  }) as any;

describe('слоты', () => {
  it('5 слотов в день, потраченные — заняты', () => {
    const p = state();
    expect(slotsLeft(p)).toBe(SLOTS_PER_DAY);
    spendSlots(p, 2);
    expect(p.slotsUsed).toBe(2);
    expect(slotsLeft(p)).toBe(3);
    expect(canSpendSlots(p, 3)).toBe(true);
    expect(canSpendSlots(p, 4)).toBe(false);
  });

  it('голод падает за слоты', () => {
    const p = state();
    spendSlots(p, 3);
    expect(p.hunger).toBe(DEFAULT_HUNGER - 18);
  });
});

describe('тренировки', () => {
  it('гимнастика качает стат и тратит ресурсы', () => {
    const p = state();
    const r = train(p, 'gym');
    expect(r.ok).toBe(true);
    expect(p.combat.power.level + p.combat.power.xp / 1000).toBeGreaterThan(5);
    expect(p.money).toBe(4500);
    expect(p.energy).toBe(7);
    expect(p.slotsUsed).toBe(1);
  });

  it('без слотов/денег/энергии — отказ', () => {
    expect(train(state({ slotsUsed: 5 }), 'gym')).toMatchObject({ ok: false, error: 'slots' });
    expect(train(state({ money: 0 }), 'gym')).toMatchObject({ ok: false, error: 'money' });
    expect(train(state({ energy: 1 }), 'gym')).toMatchObject({ ok: false, error: 'energy' });
    expect(train(state(), 'nope')).toMatchObject({ ok: false, error: 'unknown' });
  });

  it('ensureCombat чинит старые сейвы', () => {
    const p = { combat: { power: { level: 9, xp: 3 } } } as any;
    ensureCombat(p);
    expect(p.combat.power.level).toBe(9);
    expect(p.combat.agility).toEqual({ level: 5, xp: 0 });
  });
});

describe('еда и отдых', () => {
  it('еда кормит и не тратит слот', () => {
    const p = state({ hunger: 30 });
    const r = eat(p, 'home');
    expect(r.ok).toBe(true);
    expect(p.hunger).toBe(80);
    expect(p.slotsUsed).toBe(0);
    expect(p.money).toBe(4300);
  });

  it('ресторан поднимает настроение', () => {
    const p = state({ motivation: 40 });
    expect(eat(p, 'restaurant').ok).toBe(true);
    expect(p.motivation).toBe(49);
  });

  it('отдых тратит слот и даёт энергию', () => {
    const p = state({ energy: 4 });
    const r = rest(p, 'friends');
    expect(r.ok).toBe(true);
    expect(p.slotsUsed).toBe(1);
    expect(p.energy).toBe(7);
    expect(p.motivation).toBe(74);
  });
});

describe('ночь', () => {
  it('голод падает; голодовка бьёт по здоровью', () => {
    const p = state({ hunger: 5, health: 80 });
    const r = overnight(p);
    expect(r.starved).toBe(true);
    expect(p.hunger).toBe(0);
    expect(p.health).toBe(80 - STARVATION_HEALTH_HIT);
  });

  it('сытый игрок спит спокойно', () => {
    const p = state({ hunger: 50, health: 80 });
    expect(overnight(p).starved).toBe(false);
    expect(p.hunger).toBe(50 - HUNGER_OVERNIGHT);
    expect(p.health).toBe(80);
  });

  it('stat() отдаёт дефолт для старых сейвов', () => {
    expect(stat(state({ combat: undefined }), 'power')).toEqual({ level: 5, xp: 0 });
  });
});
