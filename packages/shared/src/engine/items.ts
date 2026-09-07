import { ItemDefinition } from '../types';

/**
 * Item effects — content-driven helpers.
 *
 * Item definitions live in content/items.json; these helpers compute
 * the aggregate effect of owned items so the engine never hardcodes ids.
 */

export interface ItemEffectSource {
  id: string;
  effects?: Partial<ItemDefinition['effects']>;
}

/** Sum a numeric effect across owned items */
export function itemBonusSum(
  owned: string[],
  defs: ItemEffectSource[],
  key: keyof NonNullable<ItemEffectSource['effects']>
): number {
  const ownedSet = new Set(owned);
  let total = 0;
  for (const def of defs) {
    if (!ownedSet.has(def.id)) continue;
    const value = def.effects?.[key];
    if (typeof value === 'number') total += value;
  }
  return total;
}

/** XP multiplier from owned items (percent bonuses) */
export function itemXpMult(owned: string[], defs: ItemEffectSource[]): number {
  return 1 + itemBonusSum(owned, defs, 'xpBonus');
}

/** Chance (0..0.8) that an action costs one less energy */
export function itemEnergyCostChance(owned: string[], defs: ItemEffectSource[]): number {
  return Math.min(0.8, itemBonusSum(owned, defs, 'energyCostChance'));
}

/** Daily motivation/health drip from owned items */
export function itemDailyBonuses(
  owned: string[],
  defs: ItemEffectSource[]
): { motivation: number; health: number } {
  return {
    motivation: itemBonusSum(owned, defs, 'motivationBonus'),
    health: itemBonusSum(owned, defs, 'healthBonus'),
  };
}
