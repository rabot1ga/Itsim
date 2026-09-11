import {
  SKIN_TONES,
  HAIR_COLOURS,
  CLOTH_COLOURS,
  TROUSER_COLOURS,
  SHOE_COLOURS,
  resolveLookHexes,
} from '@itsim/shared';

export { SKIN_TONES, HAIR_COLOURS, CLOTH_COLOURS, TROUSER_COLOURS, SHOE_COLOURS };

/**
 * Palettes and looks.
 *
 * The sprite library is small on purpose: 19 character bases, 9 pets. The
 * variety comes from recolouring — every base ships a map of which colours are
 * hair, skin, top, trousers and shoes, so swapping a ramp gives a new person
 * without a new drawing. 19 bases × 6 skins × 10 hair × 12 tops × 8 trousers ×
 * 5 shoes is over half a million combinations; a player's own look is picked
 * deterministically from their genetic seed, so it never changes under them.
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

const DEFAULT_COAT = ['#b98d60', '#8a6238', '#5b4630', '#2f2b28', '#cfd4dc'] as const;

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

/** Wardrobe entry id → the silhouette it should read as. */
const TOP_STYLE: Record<string, BaseLook['top']> = {
  top_hoodie_gray: 'hoodie',
  top_hoodie_localhost: 'hoodie',
  top_hoodie_corp: 'hoodie',
  top_hoodie_cat: 'hoodie',
  top_tshirt: 'tshirt',
  top_shirt: 'shirt',
  top_jacket: 'jacket',
};

const HAIR_STYLE: Record<string, BaseLook['hair']> = {
  hair_buzzcut: 'buzzcut',
  hair_short: 'short',
  hair_messy: 'short',
  hair_long: 'long',
  hair_bald: 'bald',
  hair_manbun: 'manbun',
  hair_curly: 'curly',
  hair_undercut: 'undercut',
  hair_spiky: 'short',
  hair_ponytail: 'ponytail',
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
  genetics?: {
    seed?: string;
    hairStyle?: string;
    hairColor?: string;
    skinTone?: string;
    top?: string;
    beard?: string;
  };
  avatar?: {
    hair?: string | null;
    top?: string | null;
    bottom?: string | null;
    beard?: string | null;
    /** explicit colour choices from the wardrobe */
    skin?: string | null;
    hairColor?: string | null;
    topColor?: string | null;
    bottomColor?: string | null;
    shoeColor?: string | null;
  } | null;
  /** anything stable and unique when there is no genetic seed yet */
  fallbackSeed?: string;
}

/**
 * The player's own figure: the base sprite whose clothes match their wardrobe,
 * recoloured to the SAME canonical hexes the SVG portrait and mirror use
 * (see shared/lookResolve — one identity across renderers).
 */
export function characterLook(input: LookInput): CharacterLook {
  const seed = input.genetics?.seed ?? input.fallbackSeed ?? 'anon';
  const look = resolveLookHexes(input.genetics, input.avatar);

  const wantHair = HAIR_STYLE[look.hairStyle ?? ''] ?? null;
  const wantTop = TOP_STYLE[look.top ?? ''] ?? null;
  const wantBeard = (input.avatar?.beard ?? input.genetics?.beard ?? 'beard_none') !== 'beard_none';

  const ids = Object.keys(CHARACTER_BASES);
  const byHair = wantHair ? ids.filter((id) => CHARACTER_BASES[id].hair === wantHair) : ids;
  const byBoth = wantTop ? byHair.filter((id) => CHARACTER_BASES[id].top === wantTop) : byHair;
  let pool = byBoth.length ? byBoth : byHair.length ? byHair : ids;
  // A beard is rare in the sprite library (a17/a18): take it when possible.
  if (wantBeard) {
    const bearded = pool.filter((id) => CHARACTER_BASES[id].beard);
    if (bearded.length) pool = bearded;
  }
  const base = pool[hashSeed(seed + ':base') % pool.length];

  return {
    base,
    colours: {
      skin: look.skin,
      hair: look.hair,
      top: look.topColour,
      bottom: look.bottomColour,
      shoes: look.shoes,
    },
  };
}

/** A pet's coat, stable per player and per animal. */
export function petLook(seed: string, petId: string): Record<string, string> {
  const species = petId.replace(/_(sleep|eat|play)$/, '');
  const pick = rolls(`${seed}:${species}`);
  const pool = COAT_COLOURS[species] ?? DEFAULT_COAT;
  return { coat: pool[pick(pool.length)] };
}
