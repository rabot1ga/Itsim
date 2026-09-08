/**
 * Character colours.
 *
 * The isometric figures are recoloured at runtime: a sprite ships shading
 * ramps tagged by role (skin, hair, top, trousers, shoes) and the renderer
 * rebuilds each ramp around a chosen colour. These are the colours a player
 * can choose, and they live in shared so the server can validate a wardrobe
 * change with the same list the UI shows.
 */

export const SKIN_TONES = ['#f5c6a0', '#e8b088', '#d29a70', '#b57a52', '#8d5a3c', '#5f3a26'] as const;

export const HAIR_COLOURS = [
  '#2b2320',
  '#4a3327',
  '#6f4a2c',
  '#a06a33',
  '#d7a94b',
  '#e6d3a3',
  '#8e8e96',
  '#cfd4dc',
  '#a8443b',
  '#5b6f9c',
] as const;

export const CLOTH_COLOURS = [
  '#3a4456',
  '#2a3240',
  '#5b6f9c',
  '#a9c6e0',
  '#7fae7a',
  '#4b7a58',
  '#c2565a',
  '#d99a4e',
  '#f4d35e',
  '#8a6238',
  '#b98d60',
  '#e9edf4',
] as const;

export const TROUSER_COLOURS = [
  '#2a3240',
  '#3a4456',
  '#4a5568',
  '#5b6f9c',
  '#6b5a46',
  '#8a6238',
  '#37414f',
  '#767c88',
] as const;

export const SHOE_COLOURS = ['#1e2430', '#2a3240', '#e9edf4', '#8a6238', '#c2565a'] as const;

/** Wardrobe slots that hold a colour rather than a garment. */
export const LOOK_SLOTS = ['skin', 'hairColor', 'topColor', 'bottomColor', 'shoeColor'] as const;
export type LookSlotId = (typeof LOOK_SLOTS)[number];

export const LOOK_SLOT_NAMES: Record<LookSlotId, string> = {
  skin: 'Тон кожи',
  hairColor: 'Цвет волос',
  topColor: 'Цвет верха',
  bottomColor: 'Цвет низа',
  shoeColor: 'Обувь',
};

export function isLookSlot(slot: string): slot is LookSlotId {
  return (LOOK_SLOTS as readonly string[]).includes(slot);
}

export function lookPalette(slot: LookSlotId): readonly string[] {
  switch (slot) {
    case 'skin':
      return SKIN_TONES;
    case 'hairColor':
      return HAIR_COLOURS;
    case 'topColor':
      return CLOTH_COLOURS;
    case 'bottomColor':
      return TROUSER_COLOURS;
    case 'shoeColor':
      return SHOE_COLOURS;
  }
}

/** Only colours from the palette are accepted — no arbitrary hex from clients. */
export function lookColourAllowed(slot: string, colour: string): boolean {
  return isLookSlot(slot) && lookPalette(slot).includes(colour.toLowerCase());
}

/** Which recolour role each wardrobe colour slot drives. */
export const LOOK_SLOT_ROLE: Record<LookSlotId, string> = {
  skin: 'skin',
  hairColor: 'hair',
  topColor: 'top',
  bottomColor: 'bottom',
  shoeColor: 'shoes',
};
