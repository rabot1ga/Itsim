import type { AvatarCustomization, GeneticTraits } from '../types';
import { SKIN_TONES, HAIR_COLOURS, lookColourAllowed } from './isoLook';

/**
 * Canonical look resolver — one identity for every renderer.
 *
 * The SVG portrait, the wardrobe mirror and the isometric room/office figure
 * must draw the SAME person: the seed proposes, the wardrobe disposes. Every
 * renderer used to resolve colours on its own (the iso figure even rolled
 * random colours per seed), so the room stranger could differ from the
 * portrait entirely. This module is the single source of truth: it maps a
 * trait id (genetics) or an explicit wardrobe pick to one canonical hex.
 *
 * Hexes for garments are sampled from the actual SVG wardrobe art
 * (dominant fill), skin/hair derive from the iso palettes (6 genetics
 * skin tones map 1:1 onto the 6 iso skin ramps).
 */

export const SKIN_LOOK_HEX: Record<string, string> = {
  skin_pale: SKIN_TONES[0],
  skin_light: SKIN_TONES[1],
  skin_olive: SKIN_TONES[2],
  skin_tan: SKIN_TONES[3],
  skin_brown: SKIN_TONES[4],
  skin_dark: SKIN_TONES[5],
};

export const HAIR_LOOK_HEX: Record<string, string> = {
  hair_black: '#2b2320',
  hair_brown: '#6f4a2c',
  hair_blond: '#d7a94b',
  hair_red: '#a8443b',
  hair_gray: '#cfd4dc',
  hair_blue: '#5b6f9c',
};

/** Dominant art fill per wardrobe top (the t-shirt really is green). */
export const TOP_LOOK_HEX: Record<string, string> = {
  top_hoodie_cat: '#3c414c',
  top_hoodie_corp: '#d99a4e',
  top_hoodie_gray: '#7a7f88',
  top_hoodie_localhost: '#30343c',
  top_jacket: '#5b4636',
  top_shirt: '#cfe0ee',
  top_tshirt: '#4f9d69',
};

/** Dominant art fill per wardrobe bottom (deduced from the SVG garment body). */
export const BOTTOM_LOOK_HEX: Record<string, string> = {
  bottom_jeans: '#a9b1bf',
  bottom_chinos: '#c6b7a4',
  bottom_shorts: '#c6ccd8',
  bottom_suit: '#1c1f26',
  bottom_sweatpants: '#454e5c',
};

/** The SVG figure wears built-in dark shoes; the iso figure follows. */
export const DEFAULT_SHOES_HEX = '#1e2430';
export const DEFAULT_BOTTOM_ID = 'bottom_jeans';

export interface ResolvedLook {
  /** garment entry ids (beard-only genetics have no bottom trait) */
  hairStyle: string | null;
  top: string | null;
  bottom: string;
  /** canonical hexes per iso recolour role */
  skin: string;
  hair: string;
  topColour: string;
  bottomColour: string;
  shoes: string;
}

/**
 * Merge genetics + wardrobe into one concrete look.
 *
 * Colour rule per slot: explicit wardrobe hex (already validated by the
 * server; double-checked here) wins, otherwise the trait id's canonical hex,
 * otherwise the first palette entry.
 */
export function resolveLookHexes(
  genetics: Partial<Pick<GeneticTraits, 'skinTone' | 'hairColor' | 'hairStyle' | 'top'>> | null | undefined,
  avatar:
    | Pick<
        AvatarCustomization,
        'hair' | 'top' | 'bottom' | 'skin' | 'hairColor' | 'topColor' | 'bottomColor' | 'shoeColor'
      >
    | null
    | undefined
): ResolvedLook {
  const hairStyle = avatar?.hair ?? genetics?.hairStyle ?? null;
  const top = avatar?.top ?? genetics?.top ?? null;
  const bottom = avatar?.bottom ?? DEFAULT_BOTTOM_ID;

  const fromOverride = (slot: Parameters<typeof lookColourAllowed>[0], hex: string | null | undefined) =>
    hex && lookColourAllowed(slot, hex) ? hex.toLowerCase() : null;

  return {
    hairStyle,
    top,
    bottom,
    skin:
      fromOverride('skin', avatar?.skin) ??
      (genetics?.skinTone ? SKIN_LOOK_HEX[genetics.skinTone] : null) ??
      SKIN_TONES[0],
    hair:
      fromOverride('hairColor', avatar?.hairColor) ??
      (genetics?.hairColor ? HAIR_LOOK_HEX[genetics.hairColor] : null) ??
      HAIR_COLOURS[0],
    topColour: fromOverride('topColor', avatar?.topColor) ?? (top ? TOP_LOOK_HEX[top] : null) ?? '#7a7f88',
    bottomColour: fromOverride('bottomColor', avatar?.bottomColor) ?? BOTTOM_LOOK_HEX[bottom] ?? '#2a3240',
    shoes: fromOverride('shoeColor', avatar?.shoeColor) ?? DEFAULT_SHOES_HEX,
  };
}

/** Manifest tint-slot → genetics trait id (used when a canonical hex exists). */
export function traitIdForTintSlot(
  tintSlot: string,
  traits: Pick<GeneticTraits, 'skinTone' | 'hairColor'> | null | undefined
): string | null {
  if (!traits) return null;
  switch (tintSlot) {
    case 'skinTone':
      return traits.skinTone;
    case 'hairColor':
      return traits.hairColor;
    default:
      return null;
  }
}

/** Canonical hex for a genetics tint slot, if one is on record. */
export function canonicalTintHex(tintSlot: string, traitId: string): string | null {
  switch (tintSlot) {
    case 'skinTone':
      return SKIN_LOOK_HEX[traitId] ?? null;
    case 'hairColor':
      return HAIR_LOOK_HEX[traitId] ?? null;
    default:
      return null;
  }
}
