import { describe, it, expect } from 'vitest';
import {
  AVATAR_EDITABLE_SLOTS,
  avatarEntryStatus,
  avatarChangeCost,
  buildAvatarUnlockContext,
  geneticTraitForSlot,
  isAvatarSlotId,
  PANTS_COST,
  HAIRCUT_COST,
} from '../avatarCustom';
import type { AvatarUnlockContext } from '../avatarCustom';

/**
 * The avatar is drawn full-body, so trousers are a real wardrobe slot with its
 * own unlock rules. These tests pin the rules down: nobody should ever end up
 * with a character that has no legs to dress.
 */

function ctx(over: Partial<AvatarUnlockContext> = {}): AvatarUnlockContext {
  return {
    achievements: [],
    items: [],
    skillLevel: () => 0,
    totalLevels: 0,
    hasJob: false,
    housingLevel: 0,
    hasPet: false,
    entitlements: [],
    ...over,
  };
}

describe('wardrobe slots', () => {
  it('includes the trousers slot', () => {
    expect(AVATAR_EDITABLE_SLOTS).toContain('bottom');
    expect(isAvatarSlotId('bottom')).toBe(true);
    expect(isAvatarSlotId('legs')).toBe(false);
  });

  it('gives every player something to wear from day one', () => {
    const c = ctx();
    for (const free of ['bottom_jeans', 'bottom_sweatpants', 'bottom_shorts']) {
      expect(avatarEntryStatus(c, 'bottom', free).unlocked, free).toBe(true);
    }
  });

  it('gates the smarter trousers behind progress', () => {
    const broke = ctx();
    expect(avatarEntryStatus(broke, 'bottom', 'bottom_chinos').unlocked).toBe(false);
    expect(avatarEntryStatus(broke, 'bottom', 'bottom_chinos').hint).not.toBe('');
    expect(avatarEntryStatus(ctx({ hasJob: true }), 'bottom', 'bottom_chinos').unlocked).toBe(true);

    expect(avatarEntryStatus(broke, 'bottom', 'bottom_suit').unlocked).toBe(false);
    expect(avatarEntryStatus(ctx({ housingLevel: 2 }), 'bottom', 'bottom_suit').unlocked).toBe(true);
    expect(
      avatarEntryStatus(ctx({ achievements: ['reached_senior'] }), 'bottom', 'bottom_suit').unlocked
    ).toBe(true);
  });

  it('lets Stars purchases bypass the gate', () => {
    const paid = ctx({ entitlements: ['bottom_suit'] });
    expect(avatarEntryStatus(paid, 'bottom', 'bottom_suit').unlocked).toBe(true);
  });

  it('rejects unknown trousers', () => {
    expect(avatarEntryStatus(ctx(), 'bottom', 'bottom_kilt').unlocked).toBe(false);
  });

  it('charges the tailor, but never for a no-op change', () => {
    expect(avatarChangeCost('bottom', 'bottom_chinos', 'bottom_jeans')).toBe(PANTS_COST);
    expect(avatarChangeCost('bottom', 'bottom_jeans', 'bottom_jeans')).toBe(0);
    // the barber still charges his own price
    expect(avatarChangeCost('hair', 'hair_short', 'hair_long')).toBe(HAIRCUT_COST);
  });

  it('defaults to jeans instead of a genetic trait', () => {
    expect(geneticTraitForSlot({ hairStyle: 'hair_long' }, 'bottom')).toBe('bottom_jeans');
    expect(geneticTraitForSlot(undefined, 'bottom')).toBeUndefined();
  });

  it('builds an unlock context straight from player state', () => {
    const c = buildAvatarUnlockContext({
      achievements: ['first_offer'],
      items: ['pet_cat'],
      skills: {},
      job: { companyId: 'x' },
      housingLevel: 1,
    } as never);
    expect(c.hasJob).toBe(true);
    expect(c.hasPet).toBe(true);
    expect(avatarEntryStatus(c, 'bottom', 'bottom_chinos').unlocked).toBe(true);
  });
});
