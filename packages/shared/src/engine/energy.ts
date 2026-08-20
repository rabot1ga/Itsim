import { PlayerState, HousingLevel } from '../types';
import { clamp } from './utils';

/**
 * Energy system — section 4.3 of TZ
 */

const BASE_ENERGY = 10;
const HEALTH_HIGH_BONUS = 2;   // health > 80
const HEALTH_LOW_PENALTY = -3; // health < 35
const MOTIVATION_HIGH_BONUS = 2;
const MOTIVATION_LOW_PENALTY = -2;
const BURNOUT_MULT = 0.5;
const MAX_ENERGY = 16;
const MIN_ENERGY = 3;

// Housing bonuses by level
const HOUSING_BONUS: Record<HousingLevel, number> = {
  0: 0,  // dorm
  1: 1,  // outskirts
  2: 2,  // center
  3: 2,  // own mortgage
  4: 3,  // penthouse
  5: 0,
};

// Item energy bonuses
const ITEM_ENERGY_BONUSES: Record<string, number> = {
  'herman_miller': 2,
  'gaming_chair': 1,
  'coffee_machine': 2,
  'gym_membership': 1,
};

const MAX_ITEM_ENERGY_BONUS = 4;

export function calculateMaxEnergy(p: PlayerState, perkEnergy: number = 0): number {
  let e = BASE_ENERGY + perkEnergy;

  // Health bonuses
  if (p.health > 80) e += HEALTH_HIGH_BONUS;
  if (p.health < 35) e += HEALTH_LOW_PENALTY;

  // Motivation bonuses
  if (p.motivation > 80) e += MOTIVATION_HIGH_BONUS;
  if (p.motivation < 30) e += MOTIVATION_LOW_PENALTY;

  // Housing bonus
  e += HOUSING_BONUS[p.housingLevel] ?? 0;

  // Item bonuses (capped at +4 total)
  let itemBonus = 0;
  for (const itemId of p.items) {
    const bonus = ITEM_ENERGY_BONUSES[itemId] ?? 0;
    itemBonus += bonus;
  }
  e += Math.min(itemBonus, MAX_ITEM_ENERGY_BONUS);

  // Time management soft skill
  const tmLevel = p.softSkills['time_management']?.level ?? 0;
  e += Math.floor(tmLevel / 25); // +1 every 25 levels, max +4

  // Burnout
  if (p.burnoutDays > 0) {
    e = Math.floor(e * BURNOUT_MULT);
  }

  return clamp(e, MIN_ENERGY, MAX_ENERGY);
}

/**
 * Offline energy banking — section 2.4
 * Days accrue at 1 per 3.5 real hours, max 7 in bank
 */
export function calculateOfflineBankedDays(
  lastTickAt: number,
  now: number
): number {
  const elapsedMs = now - lastTickAt;
  const threePointFiveHours = 3.5 * 3600 * 1000;
  const earned = Math.floor(elapsedMs / threePointFiveHours);
  return Math.min(7, earned);
}

/**
 * Calculate time to advance lastTickAt (not losing remainder)
 */
export function advanceLastTick(lastTickAt: number, earnedDays: number): number {
  const threePointFiveHours = 3.5 * 3600 * 1000;
  return lastTickAt + earnedDays * threePointFiveHours;
}

/**
 * Calculate max energy from item bonuses
 */
export function itemEnergyBonus(items: string[]): number {
  let total = 0;
  for (const itemId of items) {
    total += ITEM_ENERGY_BONUSES[itemId] ?? 0;
  }
  return Math.min(total, MAX_ITEM_ENERGY_BONUS);
}