import { SKIN_TONES, HAIR_COLOURS, CLOTH_COLOURS, TROUSER_COLOURS, SHOE_COLOURS } from '@itsim/shared';

export { SKIN_TONES, HAIR_COLOURS, CLOTH_COLOURS, TROUSER_COLOURS, SHOE_COLOURS };

/**
 * Palettes and looks.
 *
 * The sprite library is small on purpose: 19 character bases, 9 pets. The
 * variety comes from recolouring — every base ships a map of which colours are
 * hair, skin, top, trousers and shoes, so swapping a ramp gives a new person
 * without a new drawing. 19 bases × 6 skins × 10 hair × 12 tops × 8 trousers ×
 * 5 shoes is over half a million combinations; a figure's look is picked
 * deterministically from its seed, so it never changes under the player.
 * Customisation is gone (22.10.2026): the seed only seeds, nobody dresses up.
 */

/**
 * Coat colours per species. A ginger cat and a black cat are both cats; a
 * salmon-pink dog is a bug. Each animal gets the range it can plausibly wear.
 */
export const COAT_COLOURS: Record<string, readonly string[]> = {
  pet_cat: ['#b98d60', '#8a6238', '#5b4630', '#2f2b28', '#cfd4dc', '#8e8e96', '#d99a4e', '#e9edf4'],
  pet_dog: ['#b98d60', '#8a6238', '#5b4630', '#2f2b28', '#cfd4dc', '#e2b254'],
  pet_bulldog: ['#b98d60', '#8a6238', '#6b5a46', '#3a3430', '#cfd4dc'],
  pet_hamster: ['#d99a4e', '#b98d60', '#e9edf4', '#8e8e96'],
  pet_cactus: ['#7fae7a', '#4b7a58', '#6b9e6a', '#9dc48c'],
  pet_robo: ['#8e8e96', '#5b6f9c', '#a9c6e0', '#3a4456', '#c2565a', '#f4d35e'],
  pet_spider: ['#2f2b28', '#3a3430', '#5b4630', '#4a4550'],
  pet_parrot: ['#7fae7a', '#a9c6e0', '#f4d35e', '#c2565a', '#5b6f9c'],
  pet_fish: ['#a9c6e0', '#5b6f9c', '#7fae7a', '#d99a4e'],
};


/** What each character base is wearing, so the wardrobe can pick a match. */
export interface BaseLook {
  top: 'hoodie' | 'tshirt' | 'shirt' | 'jacket' | 'sweater' | 'blouse' | 'dress' | 'turtleneck';
  hair: 'short' | 'long' | 'ponytail' | 'curly' | 'bald' | 'buzzcut' | 'manbun' | 'undercut';
  beard?: boolean;
}

export const CHARACTER_BASES: Record<string, BaseLook> = {
  char_a00: { top: 'hoodie', hair: 'short' },
  char_a01: { top: 'tshirt', hair: 'buzzcut' },
  char_a02: { top: 'tshirt', hair: 'short' },
  char_a03: { top: 'shirt', hair: 'curly' },
  char_a04: { top: 'shirt', hair: 'short' },
  char_a05: { top: 'jacket', hair: 'curly' },
  char_a06: { top: 'blouse', hair: 'ponytail' },
  char_a07: { top: 'sweater', hair: 'long' },
  char_a08: { top: 'hoodie', hair: 'curly' },
  char_a09: { top: 'shirt', hair: 'ponytail' },
  char_a10: { top: 'dress', hair: 'short' },
  char_a11: { top: 'jacket', hair: 'long' },
  char_a12: { top: 'hoodie', hair: 'curly' },
  char_a13: { top: 'jacket', hair: 'bald' },
  char_a14: { top: 'shirt', hair: 'ponytail' },
  char_a15: { top: 'tshirt', hair: 'manbun' },
  char_a16: { top: 'jacket', hair: 'short' },
  char_a17: { top: 'sweater', hair: 'short', beard: true },
  char_a18: { top: 'turtleneck', hair: 'undercut', beard: true },
};

/** Stable 32-bit hash — the same seed must always give the same person. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pull a deterministic stream of numbers out of one seed. */
export function rolls(seed: string): (n: number) => number {
  let state = hashSeed(seed) || 1;
  return (n: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return n <= 0 ? 0 : state % n;
  };
}

export interface CharacterLook {
  base: string;
  colours: Record<string, string>;
}

export interface LookInput {
  /** anything stable and unique: the same seed always gives the same person */
  seed?: string;
}

/**
 * A figure for the iso scene: base sprite plus a deterministic colour roll.
 * There is exactly one protagonist story-wise, so the office crew and the pet
 * aside, nobody customises anybody (identity removal, 22.10.2026).
 */
export function characterLook(input: LookInput): CharacterLook {
  const seed = input.seed ?? 'itsim-crew';
  const pick = rolls(seed);

  const ids = Object.keys(CHARACTER_BASES);
  const base = ids[hashSeed(seed + ':base') % ids.length];

  return {
    base,
    colours: {
      skin: SKIN_TONES[pick(SKIN_TONES.length)],
      hair: HAIR_COLOURS[pick(HAIR_COLOURS.length)],
      top: CLOTH_COLOURS[pick(CLOTH_COLOURS.length)],
      bottom: TROUSER_COLOURS[pick(TROUSER_COLOURS.length)],
      shoes: SHOE_COLOURS[pick(SHOE_COLOURS.length)],
    },
  };
}

/** A pet's coat, stable per player and per animal. */
