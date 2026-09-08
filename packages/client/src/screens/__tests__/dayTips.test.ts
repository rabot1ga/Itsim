import { describe, expect, it } from 'vitest';
import { tipForDay } from '../dayTips';

describe('tipForDay (onboarding window)', () => {
  it('returns a concrete tip for every day of the first week', () => {
    for (let day = 1; day <= 7; day++) {
      const tip = tipForDay(day);
      expect(tip).not.toBeNull();
      expect(tip!.title.length).toBeGreaterThan(0);
      expect(tip!.body.length).toBeGreaterThan(20);
      expect(tip!.icon.length).toBeGreaterThan(0);
    }
  });

  it('returns null outside the onboarding window and for falsy days', () => {
    expect(tipForDay(0)).toBeNull();
    expect(tipForDay(8)).toBeNull();
    expect(tipForDay(30)).toBeNull();
    expect(tipForDay(null)).toBeNull();
    expect(tipForDay(undefined)).toBeNull();
  });
});
