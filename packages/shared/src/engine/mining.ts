import { ItemDefinition } from '../types';

/**
 * Mining farm — passive crypto income (DESIGN.md 13.1 inflation sink).
 *
 * Fully deterministic: the "crypto price" is a per-day sine-noise function,
 * so the same farm state always yields the same income for a given day.
 */

export interface MiningConfig {
  priceBase: number;
  volatility: number; // 0..1
  electricityPerHashrate: number;
}

export interface MiningIncome {
  price: number;
  gross: number;
  electricity: number;
  net: number;
}

/** Deterministic per-day noise in -1..1 */
export function miningDayNoise(day: number): number {
  const x = Math.sin(day * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Daily mining income for a given hashrate on a given day.
 * price = priceBase * (1 + volatility * noise) — deterministic random walk.
 */
export function miningDailyIncome(
  hashrate: number,
  day: number,
  cfg: MiningConfig
): MiningIncome {
  const price = cfg.priceBase * (1 + cfg.volatility * miningDayNoise(day));
  const gross = hashrate * price;
  const electricity = hashrate * cfg.electricityPerHashrate;
  return {
    price,
    gross: Math.round(gross),
    electricity: Math.round(electricity),
    net: Math.round(gross - electricity),
  };
}

/**
 * Total hashrate from owned items
 */
export function hashrateOfItems(
  items: string[],
  defs: Array<Pick<ItemDefinition, 'id' | 'effects'>>
): number {
  const owned = new Set(items);
  let total = 0;
  for (const def of defs) {
    if (owned.has(def.id) && def.effects?.hashrate) {
      total += def.effects.hashrate;
    }
  }
  return total;
}

/**
 * Total electricity savings fraction (summed, capped at 0.9)
 */
export function electricitySaveOfItems(
  items: string[],
  defs: Array<Pick<ItemDefinition, 'id' | 'effects'>>
): number {
  const owned = new Set(items);
  let total = 0;
  for (const def of defs) {
    if (owned.has(def.id) && def.effects?.electricitySave) {
      total += def.effects.electricitySave;
    }
  }
  return Math.min(0.9, total);
}
