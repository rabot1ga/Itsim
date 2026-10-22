/**
 * Character colours.
 *
 * The isometric figures are recoloured at runtime: a sprite ships shading
 * ramps tagged by role (skin, hair, top, trousers, shoes) and the renderer
 * rebuilds each ramp around a chosen colour. After the identity removal
 * (22.10.2026) nobody picks these by hand — the office crew rolls them from a
 * seed — but the palettes stay here so client and server share one list.
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
