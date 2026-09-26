import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { GeneticTraits, GeneticsConfig, TintPaletteEntry } from '../types';

/**
 * Deterministic procedural generation — DESIGN.md section 3.1
 *
 * The player "genotype" is a sha256 seed derived from the wallet address
 * (or telegram id fallback). Trait picking follows the HashLips pattern:
 * per-slot salted PRNG, weighted options, palettes for tinting.
 */

export const GAME_ID = 'it-life-simulator:v2';

/**
 * Generate the base seed — hard-tied to the wallet, cannot be re-rolled.
 */
export function generatePlayerSeed(walletAddress: string, gameId: string = GAME_ID): string {
  const raw = `${walletAddress}:${gameId}:base_genetics`;
  return bytesToHex(sha256(new TextEncoder().encode(raw)));
}

/**
 * xmur3: hash a string into a 32-bit seed (deterministic across engines)
 */
function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * mulberry32 PRNG — deterministic integer-math RNG
 */
export function seededRng(seed: string): () => number {
  let a = hashStringToSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic weighted pick with a per-slot salt
 */
export function seededWeightedPick<T extends { weight: number }>(items: T[], seed: string, salt: string): T {
  const rng = seededRng(`${seed}:${salt}`);
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0];

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Pick one option from a list (palettes have uniform weight by default) */
function pickOption<T extends { id: string; weight?: number }>(options: T[], seed: string, salt: string): string {
  if (options.length === 0) return 'none';
  const weighted = options.map((o) => ({ ...o, weight: o.weight ?? 1 }));
  return seededWeightedPick(weighted, seed, salt).id;
}

/** Pick a palette entry by id (fallback: first) */
function paletteById(palette: TintPaletteEntry[], id: string): TintPaletteEntry {
  return palette.find((p) => p.id === id) ?? palette[0];
}

/**
 * Derive the full "genotype" from the seed + content config.
 * Same seed + same config = same traits, always.
 */
export function getGeneticTraits(seed: string, config: GeneticsConfig): GeneticTraits {
  return {
    seed,
    skinTone: pickOption(config.skinTones, seed, 'skin'),
    eyeShape: pickOption(config.eyes, seed, 'eye'),
    hairStyle: pickOption(config.hairstyles, seed, 'hair'),
    hairColor: pickOption(config.hairPalette, seed, 'hair_color'),
    beard: pickOption(config.beards, seed, 'beard'),
    top: pickOption(config.tops, seed, 'top'),
    accessory: pickOption(config.accessories, seed, 'accessory'),
    windowShape: pickOption(config.windows, seed, 'window'),
    wallColor: pickOption(config.wallPalette, seed, 'wall'),
    decor: pickOption(config.decorOptions ?? [], seed, 'decor'),
  };
}

/**
 * CSS filter string to recolor a grayscale layer (the "tinting" trick).
 * Grayscale → sepia tone map → hue rotation → saturation/lightness.
 */
export function tintFilter(entry: TintPaletteEntry): string {
  const sat = entry.sat ?? 2.2;
  const light = entry.light ?? 1;
  return `sepia(1) saturate(${sat}) hue-rotate(${entry.hue}deg) brightness(${light})`;
}

/**
 * Hue of the sepia ramp the grayscale masters were tuned against. `tintFilter`
 * rotates *from* it, so a hand-picked colour has to be expressed as a rotation
 * of the same base or the two paths disagree about what «чёрный» looks like.
 */
const SEPIA_BASE_HUE = 40;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Ручной цвет из гардероба → параметры тонировки grayscale-мастера.
 *
 * Палитра генетики — это квантованные отступы от сепиевой базы, а игрок выбирает
 * хекс, который палитре не соответствует. Точного реверса у `sepia → saturate →
 * hue-rotate → brightness` нет, поэтому перевод в HSL и три множителя:
 * приближение сознательное, но детерминированное (снапшот карточки обязан
 * воспроизводиться), и в пределах одной выбранной гаммы оно монотонно: темнее
 * хекс — меньше brightness, насыщеннее — больше saturate.
 */
export function tintFromHex(hex: string | null | undefined): TintPaletteEntry | null {
  const raw = (hex ?? '').trim();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  const full = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (short) return tintFromHex(`#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`);
  if (!full) return null;
  const value = parseInt(full[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  return {
    id: `custom_${full[1].toLowerCase()}`,
    name: raw,
    hue: hue - SEPIA_BASE_HUE,
    sat: Number(clamp(sat / 0.5, 0.1, 3).toFixed(2)),
    light: Number(clamp(light / 0.5, 0.35, 1.6).toFixed(2)),
  };
}

/**
 * Resolve a palette entry for a trait slot
 */
export function traitTint(slot: string, traits: GeneticTraits, config: GeneticsConfig): TintPaletteEntry | null {
  switch (slot) {
    case 'skinTone':
      return paletteById(config.skinTones, traits.skinTone);
    case 'hairColor':
      return paletteById(config.hairPalette, traits.hairColor);
    case 'wallColor':
      return paletteById(config.wallPalette, traits.wallColor);
    default:
      return null;
  }
}

/**
 * Combine an optional palette tint with explicit overrides (e.g. items).
 */
export function combineTints(base: TintPaletteEntry | null, override?: Partial<TintPaletteEntry>): string {
  if (!base && !override) return 'none';
  return tintFilter({
    id: base?.id ?? 'override',
    name: base?.name ?? 'override',
    hue: override?.hue ?? base?.hue ?? 0,
    sat: override?.sat ?? base?.sat,
    light: override?.light ?? base?.light,
  });
}
