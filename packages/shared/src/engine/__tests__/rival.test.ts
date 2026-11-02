import { describe, expect, it } from 'vitest';
import { advanceRival, ensureRival, playerPower, rivalGap, rivalPressure } from '../rival';

/**
 * Соперник (DESIGN-LIVING-WORLD, стадия 2): претендент на ту же ступень.
 * Закон 3 — разрыв всегда виден (rivalGap), давление на ревью прозрачно
 * (rivalPressure).
 */
const player = (over: Record<string, unknown> = {}) =>
  ({
    skills: { javascript: { level: 10, xp: 0 }, python: { level: 4, xp: 0 } },
    softSkills: { communication: { level: 6, xp: 0 } },
    currentDay: 9,
    ...over,
  }) as any;

describe('playerPower', () => {
  it('сумма уровней навыков и софт-скиллов', () => {
    expect(playerPower(player())).toBe(20);
  });
});

describe('ensureRival', () => {
  it('создаёт соперника рядом с игроком и идемпотентно', () => {
    const p = player();
    const r1 = ensureRival(p);
    expect(r1.name.length).toBeGreaterThan(0);
    expect(Math.abs(r1.progress - 20)).toBeLessThanOrEqual(2);
    const r2 = ensureRival(p);
    expect(r2).toBe(r1);
    expect(p.rival.name).toBe(r1.name);
  });
});

describe('advanceRival / rivalGap / rivalPressure', () => {
  it('рост задаётся снаружи (0.8–1.2)', () => {
    const p = player();
    const r = ensureRival(p);
    const before = r.progress;
    advanceRival(p, 1.2);
    expect(p.rival!.progress).toBeCloseTo(before + 1.2);
  });

  it('разрыв: игрок впереди > 0, соперник впереди < 0', () => {
    const p = player();
    ensureRival(p);
    expect(rivalGap(p)).toBeGreaterThanOrEqual(-2);
    advanceRival(p, 50);
    expect(rivalGap(p)).toBeLessThan(0);
  });

  it('давление: соперник впереди усиливает ревью, отрыв — ослабляет', () => {
    const p = player();
    ensureRival(p);
    advanceRival(p, 30); // соперник впереди
    const pressureAhead = rivalPressure(p);
    expect(pressureAhead).toBeGreaterThan(0);
    expect(pressureAhead).toBeLessThanOrEqual(0.6);
    // игрок рвёт вперёд
    p.skills.javascript.level = 60;
    const pressureBehind = rivalPressure(p);
    expect(pressureBehind).toBeLessThan(0);
    expect(pressureBehind).toBeGreaterThanOrEqual(-0.3);
  });

  it('без соперника — без давления', () => {
    expect(rivalGap(player())).toBe(0);
    expect(rivalPressure(player())).toBe(0);
  });
});
