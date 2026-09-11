import { describe, expect, it } from 'vitest';
import {
  resolveLookHexes,
  canonicalTintHex,
  traitIdForTintSlot,
  SKIN_LOOK_HEX,
  HAIR_LOOK_HEX,
  TOP_LOOK_HEX,
  BOTTOM_LOOK_HEX,
  DEFAULT_SHOES_HEX,
  DEFAULT_BOTTOM_ID,
} from '../lookResolve';
import { SKIN_TONES, HAIR_COLOURS, CLOTH_COLOURS, TROUSER_COLOURS, SHOE_COLOURS } from '../isoLook';

/**
 * One identity across renderers (docs 2026-09-12): the SVG portrait, the
 * wardrobe mirror and the iso room all consume these hexes, so a player can
 * never be two different people.
 */

const genetics = {
  seed: 'look-test',
  skinTone: 'skin_olive',
  hairColor: 'hair_brown',
  hairStyle: 'hair_messy',
  top: 'top_tshirt',
};

describe('resolveLookHexes', () => {
  it('maps genetics to canonical hexes when there is no wardrobe input', () => {
    const look = resolveLookHexes(genetics, null);
    expect(look.skin).toBe(SKIN_LOOK_HEX.skin_olive);
    expect(look.hair).toBe(HAIR_LOOK_HEX.hair_brown);
    expect(look.topColour).toBe(TOP_LOOK_HEX.top_tshirt);
    expect(look.bottom).toBe(DEFAULT_BOTTOM_ID);
    expect(look.bottomColour).toBe(BOTTOM_LOOK_HEX.bottom_jeans);
    expect(look.shoes).toBe(DEFAULT_SHOES_HEX);
    expect(look.hairStyle).toBe('hair_messy');
    expect(look.top).toBe('top_tshirt');
  });

  it('lets wardrobe garments and dyes win over genetics', () => {
    const look = resolveLookHexes(genetics, {
      hair: 'hair_manbun',
      top: 'top_jacket',
      bottom: 'bottom_suit',
      skin: SKIN_TONES[5],
      hairColor: '#d7a94b',
      topColor: CLOTH_COLOURS[0],
      bottomColor: TROUSER_COLOURS[1],
      shoeColor: SHOE_COLOURS[2],
    });
    expect(look.hairStyle).toBe('hair_manbun');
    expect(look.top).toBe('top_jacket');
    expect(look.bottom).toBe('bottom_suit');
    expect(look.skin).toBe(SKIN_TONES[5]);
    expect(look.hair).toBe('#d7a94b');
    expect(look.topColour).toBe(CLOTH_COLOURS[0]);
    expect(look.bottomColour).toBe(TROUSER_COLOURS[1]);
    expect(look.shoes).toBe(SHOE_COLOURS[2]);
  });

  it('ignores off-palette overrides instead of trusting raw client hex', () => {
    const look = resolveLookHexes(genetics, { hairColor: '#deadbe', skin: '#00ff00' });
    expect(look.hair).toBe(HAIR_LOOK_HEX.hair_brown);
    expect(look.skin).toBe(SKIN_LOOK_HEX.skin_olive);
  });

  it('survives missing genetics (anon player before onboarding)', () => {
    const look = resolveLookHexes(null, null);
    expect(look.skin).toBe(SKIN_TONES[0]);
    expect(look.hair).toBe(HAIR_COLOURS[0]);
    expect(look.bottom).toBe(DEFAULT_BOTTOM_ID);
    expect(look.hairStyle).toBeNull();
    expect(look.top).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    expect(resolveLookHexes(genetics, null)).toEqual(resolveLookHexes(genetics, null));
  });
});

describe('canonical tint helpers', () => {
  it('resolves trait ids per tint slot', () => {
    expect(traitIdForTintSlot('skinTone', genetics)).toBe('skin_olive');
    expect(traitIdForTintSlot('hairColor', genetics)).toBe('hair_brown');
    expect(traitIdForTintSlot('wallColor', genetics)).toBeNull();
    expect(traitIdForTintSlot('skinTone', null)).toBeNull();
  });

  it('maps trait ids to canonical hexes', () => {
    expect(canonicalTintHex('skinTone', 'skin_olive')).toBe(SKIN_LOOK_HEX.skin_olive);
    expect(canonicalTintHex('hairColor', 'hair_blond')).toBe(HAIR_LOOK_HEX.hair_blond);
    expect(canonicalTintHex('skinTone', 'skin_unknown')).toBeNull();
    expect(canonicalTintHex('wallColor', 'wall_pink')).toBeNull();
  });
});
