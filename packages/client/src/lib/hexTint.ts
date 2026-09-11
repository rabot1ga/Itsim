import type { TintPaletteEntry } from '@itsim/shared';

/**
 * Approximate the palette tint for an arbitrary wardrobe colour.
 *
 * The genetics palettes pre-bake (hue, sat, light) per trait; the free
 * colour buttons of the wardrobe save raw hex. To recolour the grayscale
 * skin/hair layers with the same CSS-filter trick, convert the hex to HSL
 * and map it onto the same filter space. It is intentionally approximate —
 * a mirror is free, precision is not the point.
 */
export function hexToTint(hex: string): TintPaletteEntry | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

  return {
    id: `hex:${hex}`,
    name: hex,
    hue: Math.round(h * 360),
    // Default tint recipes land around sat 1.5–2.5; scale by how vivid the pick is.
    sat: 0.8 + s * 1.8,
    // Grayscale layers render mid (#969696≈0.59); brightness follows the pick.
    light: 0.35 + l,
  };
}

/** Which avatar colour field drives which manifest tint slot. */
export const COLOR_OVERRIDE_TO_TINT_SLOT: Record<'skin' | 'hairColor', 'skinTone' | 'hairColor'> = {
  skin: 'skinTone',
  hairColor: 'hairColor',
};

/** Build per-tint-slot overrides from the saved wardrobe colours (skin/hair). */
export function tintOverridesFromAvatar(
  avatar?: { skin?: string | null; hairColor?: string | null } | null
): Record<string, TintPaletteEntry> | null {
  if (!avatar) return null;
  const out: Record<string, TintPaletteEntry> = {};
  for (const [field, slot] of Object.entries(COLOR_OVERRIDE_TO_TINT_SLOT) as Array<
    [keyof typeof COLOR_OVERRIDE_TO_TINT_SLOT, string]
  >) {
    const value = avatar[field];
    if (!value) continue;
    const tint = hexToTint(value);
    if (tint) out[slot] = tint;
  }
  return Object.keys(out).length ? out : null;
}
