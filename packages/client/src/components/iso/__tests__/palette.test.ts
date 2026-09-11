import { describe, expect, it } from 'vitest';
import { characterLook, CHARACTER_BASES } from '../palette';
import { SKIN_LOOK_HEX, HAIR_LOOK_HEX, TOP_LOOK_HEX, BOTTOM_LOOK_HEX } from '@itsim/shared';

/**
 * The iso figure must be the same person the SVG portrait shows
 * (docs 2026-09-12 unification): colours come from the canonical resolver,
 * the base sprite only approximates the garment/hair silhouette.
 */

const genetics = {
  seed: 'iso-look-test',
  skinTone: 'skin_pale',
  hairColor: 'hair_blond',
  hairStyle: 'hair_long',
  top: 'top_hoodie_gray',
  beard: 'beard_none',
};

describe('characterLook — canonical identity', () => {
  it('colours match the portrait exactly for the same genetics', () => {
    const look = characterLook({ genetics });
    expect(look.colours.skin).toBe(SKIN_LOOK_HEX.skin_pale);
    expect(look.colours.hair).toBe(HAIR_LOOK_HEX.hair_blond);
    expect(look.colours.top).toBe(TOP_LOOK_HEX.top_hoodie_gray);
    expect(look.colours.bottom).toBe(BOTTOM_LOOK_HEX.bottom_jeans);
    expect(look).toEqual(characterLook({ genetics }));
  });

  it('a wardrobe outfit repaints and re-clothes the figure', () => {
    const look = characterLook({
      genetics,
      avatar: { top: 'top_tshirt', bottom: 'bottom_sweatpants', hairColor: '#a8443b' },
    });
    expect(look.colours.top).toBe(TOP_LOOK_HEX.top_tshirt);
    expect(look.colours.bottom).toBe(BOTTOM_LOOK_HEX.bottom_sweatpants);
    expect(look.colours.hair).toBe('#a8443b');
    expect(look.colours.skin).toBe(SKIN_LOOK_HEX.skin_pale); // untouched stays genetic
  });

  it('the base sprite approximates hair and top from the wardrobe', () => {
    const shortHoodie = characterLook({ genetics, avatar: { hair: 'hair_short', top: 'top_hoodie_corp' } });
    expect(CHARACTER_BASES[shortHoodie.base].hair).toBe('short');
    expect(CHARACTER_BASES[shortHoodie.base].top).toBe('hoodie');
  });

  it('when no base matches both, the hair silhouette still wins (documented fallback)', () => {
    // no ponytail+hoodie base exists; the figure keeps the ponytail
    const ponyHoodie = characterLook({ genetics, avatar: { hair: 'hair_ponytail', top: 'top_hoodie_corp' } });
    expect(CHARACTER_BASES[ponyHoodie.base].hair).toBe('ponytail');
  });

  it('a bearded player prefers the bearded bases when the pool has them', () => {
    // short hair, no known top → pool = all short-haired bases incl. bearded char_a17
    const look = characterLook({
      genetics: {
        seed: 'beardy',
        skinTone: 'skin_pale',
        hairColor: 'hair_brown',
        hairStyle: 'hair_short',
        top: undefined,
        beard: 'beard_full',
      } as never,
    });
    expect(CHARACTER_BASES[look.base].beard).toBe(true);
  });

  it('falls and stands gracefully for unknown genes', () => {
    const look = characterLook({ fallbackSeed: 'anon-42' });
    expect(CHARACTER_BASES[look.base]).toBeTruthy();
    expect(Object.keys(look.colours).sort()).toEqual(['bottom', 'hair', 'shoes', 'skin', 'top']);
  });
});
