import { describe, it, expect } from 'vitest';
import { PET_ACCESSORY_BADGE, petBadges } from '../lib/petSkins';

/**
 * Сезонные наборы Stars (зима/лето): косметика обязана быть видимой —
 * каждый id набора имеет бейдж-эмодзи на питомце.
 */

describe('petSkins: аксессуары сезонных наборов', () => {
  it('у каждого косметического id из наборов есть бейдж', () => {
    for (const id of ['pet_santa', 'pet_mitten', 'pet_snowflake', 'pet_flower', 'pet_icecream', 'pet_sun']) {
      expect(PET_ACCESSORY_BADGE[id], id).toBeTruthy();
    }
  });

  it('petBadges поднимает бейджи купленного комплекта', () => {
    expect(petBadges(['pet_santa', 'pet_mitten', 'pet_snowflake'])).toEqual(['🎅', '🧤', '❄️']);
    expect(petBadges(['pet_flower', 'pet_icecream', 'pet_sun'])).toEqual(['🌸', '🍦', '🌞']);
    // неизвестные id не роняют и не плодят пустые бейджи
    expect(petBadges(['pet_unknown'])).toEqual([]);
  });
});
