import { AvatarSlotId, AvatarCustomization, PlayerState, PixelComposition } from '../types/index';
import { TRAIT_COMPONENT_MAP } from './pixelArt';

/**
 * Wardrobe rules (docs/design.md §12.5) — shared by server + client like roomDecor.
 *
 * Overrides are stored as *layered* manifest ids (hair_short, top_hoodie_gray…).
 * The layered renderer uses them verbatim; the pixel renderer maps them through
 * TRAIT_COMPONENT_MAP (+ normalization below). Beards and medals are
 * layered-only: the 32×32 pixel set has no beard/medal components.
 */

export const HAIRCUT_COST = 2000;
export const BEARD_COST = 1000;
export const HAT_COST = 1000;

export const AVATAR_EDITABLE_SLOTS: AvatarSlotId[] = ['hair', 'beard', 'top', 'accessory'];

export function isAvatarSlotId(slot: string): slot is AvatarSlotId {
  return (AVATAR_EDITABLE_SLOTS as string[]).includes(slot);
}

export interface AvatarUnlockContext {
  achievements: string[];
  items: string[];
  skillLevel: (id: string) => number;
  totalLevels: number;
  hasJob: boolean;
  housingLevel: number;
  hasPet: boolean;
}

export function buildAvatarUnlockContext(
  player: Pick<PlayerState, 'achievements' | 'items' | 'skills' | 'job' | 'housingLevel'>
): AvatarUnlockContext {
  const skills = player.skills ?? {};
  const items = player.items ?? [];
  return {
    achievements: player.achievements ?? [],
    items,
    skillLevel: (id: string) => skills[id]?.level ?? 0,
    totalLevels: Object.values(skills).reduce((sum, s) => sum + (s?.level ?? 0), 0),
    hasJob: player.job != null,
    housingLevel: player.housingLevel ?? 0,
    hasPet: items.some((i) => i.startsWith('pet_')),
  };
}

export interface AvatarEntryStatus {
  unlocked: boolean;
  hint: string;
}

export function avatarEntryStatus(
  ctx: AvatarUnlockContext,
  slot: AvatarSlotId,
  entryId: string
): AvatarEntryStatus {
  const has = (item: string) => ctx.items.includes(item);
  const ach = (id: string) => ctx.achievements.includes(id);
  const lock = (hint: string): AvatarEntryStatus => ({ unlocked: false, hint });
  const open = { unlocked: true, hint: '' };

  switch (slot) {
    case 'hair':
      // Any haircut is available — the barber charges per visit, not per style.
      return /^hair_/.test(entryId) ? open : lock('Неизвестная причёска');
    case 'beard':
      return /^beard_/.test(entryId) ? open : lock('Неизвестная борода');
    case 'top': {
      switch (entryId) {
        case 'top_tshirt':
        case 'top_hoodie_gray':
        case 'top_shirt':
          return open;
        case 'top_hoodie_localhost':
          return ach('skill_50') ? open : lock('Ачивка «📚 Навык 50»');
        case 'top_hoodie_corp':
          return ctx.hasJob ? open : lock('Устройся на работу — выдадут мерч 💼');
        case 'top_jacket':
          return ctx.housingLevel >= 2 ? open : lock('Нужно жильё 2+ 🏠');
        case 'top_hoodie_cat':
          return ctx.hasPet ? open : lock('Заведи питомца 🐾');
        default:
          return lock('Неизвестная одежда');
      }
    }
    case 'accessory': {
      switch (entryId) {
        case 'acc_none':
          return open;
        case 'acc_glasses':
          return ach('skill_50') ? open : lock('Ачивка «📚 Навык 50»');
        case 'acc_headphones':
          return has('cheap_headphones') || has('sony_headphones')
            ? open
            : lock('Купи наушники 🏪');
        case 'acc_cap':
        case 'acc_beanie':
          return open; // bought at the hat stand (HAT_COST)
        case 'acc_medal':
          return ctx.achievements.length >= 3
            ? open
            : lock(`Нужно ачивок: 3 (есть ${ctx.achievements.length})`);
        case 'acc_vr_headset':
          return ach('first_million') ? open : lock('Ачивка «🤑 Первый миллион»');
        default:
          return lock('Неизвестный аксессуар');
      }
    }
  }
}

/** Money cost of applying an entry (0 when nothing changes or the slot is free). */
export function avatarChangeCost(
  slot: AvatarSlotId,
  entryId: string,
  currentEffective: string | undefined
): number {
  if (entryId === currentEffective) return 0;
  switch (slot) {
    case 'hair':
      return HAIRCUT_COST;
    case 'beard':
      return BEARD_COST;
    case 'accessory':
      return entryId === 'acc_cap' || entryId === 'acc_beanie' ? HAT_COST : 0;
    case 'top':
      return 0;
  }
}

/** Genetic trait id behind a wardrobe slot (for cost + "current" detection). */
export function geneticTraitForSlot(
  genetics: { hairStyle?: string; beard?: string; top?: string; accessory?: string } | undefined,
  slot: AvatarSlotId
): string | undefined {
  if (!genetics) return undefined;
  switch (slot) {
    case 'hair':
      return genetics.hairStyle;
    case 'beard':
      return genetics.beard;
    case 'top':
      return genetics.top;
    case 'accessory':
      return genetics.accessory;
  }
}

/**
 * Map wardrobe (layered) ids onto pixel combo categories.
 * Unknown/unmapped entries resolve to null and leave the seeded look.
 */
export function pixelWardrobeCombo(overrides: AvatarCustomization): Partial<PixelComposition> {
  const combo: Partial<PixelComposition> = {};

  if (overrides.hair) {
    combo.hair = TRAIT_COMPONENT_MAP.hair[overrides.hair] ?? null;
  }
  if (overrides.top) {
    const top = overrides.top;
    combo.clothing = top.startsWith('top_hoodie')
      ? 'clothing_hoodie'
      : top === 'top_tshirt'
        ? 'clothing_tshirt'
        : 'clothing_shirt'; // shirt + jacket read as "formal"
  }
  if (overrides.accessory) {
    // One layered slot drives two pixel categories (glasses vs hats).
    switch (overrides.accessory) {
      case 'acc_glasses':
        combo.accessory = 'accessory_glasses';
        combo.hat = 'hat_none';
        break;
      case 'acc_headphones':
        combo.accessory = 'accessory_headphones';
        combo.hat = 'hat_none';
        break;
      case 'acc_cap':
        combo.accessory = 'accessory_none';
        combo.hat = 'hat_cap';
        break;
      case 'acc_beanie':
        combo.accessory = 'accessory_none';
        combo.hat = 'hat_beanie';
        break;
      case 'acc_vr_headset':
        combo.accessory = 'accessory_none';
        combo.hat = 'hat_vr';
        break;
      case 'acc_none':
        combo.accessory = 'accessory_none';
        combo.hat = 'hat_none';
        break;
      case 'acc_medal':
        break; // layered-only, pixel look untouched
    }
  }
  // beard: layered-only (no pixel beard components)

  return combo;
}
