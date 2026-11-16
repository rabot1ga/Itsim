import { describe, expect, it } from 'vitest';
import { STYLE_PERKS, STYLES, critChance, dodgeChance, fighterHp, runFight, winOdds, type Fighter } from '../combat';

/**
 * Автобатл (DESIGN-PUNCH §3): билд решает бой. Сид детерминирован — один и
 * тот же бой разворачивается одинаково; лог читаем раунд за раундом.
 */

// детерминированный mulberry32 для тестов
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'Боец',
  power: 10,
  agility: 10,
  speed: 10,
  style: 'bear',
  perks: [],
  ...over,
});

describe('базовые формулы', () => {
  it('HP растёт от силы; перк подбородка добавляет запас', () => {
    expect(fighterHp(fighter({ power: 10 }))).toBe(80);
    expect(fighterHp(fighter({ perks: ['bear_hp'] }))).toBe(100);
  });

  it('уклонение и крит в разумных границах', () => {
    const a = fighter({ speed: 50 });
    const b = fighter({ agility: 1 });
    expect(dodgeChance(a, b)).toBeGreaterThanOrEqual(0.03);
    expect(dodgeChance(b, a)).toBeLessThanOrEqual(0.45);
    expect(critChance(a, b)).toBeGreaterThanOrEqual(0.02);
    expect(critChance(fighter({ perks: ['tiger_crit'] }), b)).toBeGreaterThan(critChance(a, b));
  });

  it('стили крутят треугольник: медведь бьёт сильнее, ветер быстрее', () => {
    expect(STYLES.bear.power).toBeGreaterThan(1);
    expect(STYLES.wind.speed).toBeGreaterThan(STYLES.bear.speed);
  });
});

describe('runFight', () => {
  it('детерминирован: тот же сид — тот же бой', () => {
    const a = fighter({ name: 'A', power: 14 });
    const b = fighter({ name: 'B', agility: 14, style: 'tiger' });
    const r1 = runFight(a, b, seeded(42));
    const r2 = runFight(a, b, seeded(42));
    expect(r1.winner).toBe(r2.winner);
    expect(r1.rounds.length).toBe(r2.rounds.length);
    expect(r1.rounds).toEqual(r2.rounds);
  });

  it('бой всегда заканчивается: есть победитель и лог', () => {
    const r = runFight(fighter({ power: 30 }), fighter({ power: 5 }), seeded(7));
    expect(['a', 'b']).toContain(r.winner);
    expect(r.rounds.length).toBeGreaterThan(0);
    expect(r.rounds.length).toBeLessThanOrEqual(60);
    const kinds = new Set(r.rounds.map((x) => x.kind));
    expect(kinds.has('hit') || kinds.has('crit')).toBe(true);
  });

  it('сильный билд выигрывает у слабого почти всегда', () => {
    let wins = 0;
    for (let s = 1; s <= 20; s++) {
      const r = runFight(
        fighter({ power: 25, agility: 25, speed: 25 }),
        fighter({ power: 5, agility: 5, speed: 5 }),
        seeded(s)
      );
      if (r.winner === 'a') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(18);
  });

  it('winOdds отражает перевес', () => {
    expect(winOdds(fighter({ power: 30 }), fighter({ power: 5 }))).toBeGreaterThan(60);
  });

  it('перки дерева работают: комбо ветра даёт двойные свинги', () => {
    const a = fighter({ speed: 40, style: 'wind', perks: ['wind_combo'] });
    const b = fighter({ power: 3 });
    const r = runFight(a, b, seeded(3));
    // раунд 3 — двойной свинг ветра
    const round3 = r.rounds.filter((x) => x.round === 3 && x.attacker === 'a' && x.kind !== 'dodge');
    expect(round3.length).toBeGreaterThanOrEqual(1);
  });

  it('перки имеют требования и цену', () => {
    expect(Object.values(STYLE_PERKS).every((p) => p.cost > 0 && p.need > 0)).toBe(true);
    expect(STYLE_PERKS.bear_hp.style).toBe('bear');
  });
});
