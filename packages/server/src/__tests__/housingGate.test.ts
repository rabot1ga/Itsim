import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Жильё: «Своя квартира (ипотека)» дешевле «Квартиры в центре» по месячному
 * платёжу (40k < 50k) — аренда центра дороже ипотечного взноса, так и в жизни.
 * Чтобы уровни оставались лестницей, сложность гейта обязана расти: требование
 * `cost × saveMult` и `saveStreakDays` строго монотонны по уровню.
 */

let housing: Array<{ level: number; cost: number; saveMult: number; saveStreakDays: number }>;

beforeAll(async () => {
  const { loadContent, getContent } = await import('../services/contentService.js');
  loadContent();
  housing = (getContent().balance?.housing ?? []) as typeof housing;
});

describe('гейт жилья: лестница уровней', () => {
  it('контент загружен и уровни полны', () => {
    expect(housing.map((h) => h.level)).toEqual([0, 1, 2, 3, 4]);
  });

  it('cost × saveMult строго растёт с уровнем (включая «дешёвую» ипотеку)', () => {
    const gated = housing.map((h) => h.cost * h.saveMult);
    for (let i = 1; i < gated.length; i += 1) {
      expect(gated[i]).toBeGreaterThan(gated[i - 1]);
    }
    expect(gated).toEqual([5000, 75000, 300000, 320000, 2250000]);
  });

  it('saveStreakDays строго растёт с уровнем', () => {
    const streaks = housing.map((h) => h.saveStreakDays);
    for (let i = 1; i < streaks.length; i += 1) {
      expect(streaks[i]).toBeGreaterThan(streaks[i - 1]);
    }
  });
});
