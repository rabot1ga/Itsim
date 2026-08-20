import { PlayerState, Grade } from '../types';

/**
 * Economy system — sections 5, 6.5
 */

// Grade salary table (section 5.4)
export const GRADE_SALARIES: Record<Grade, number> = {
  'unemployed': 0,
  'intern': 35000,
  'junior': 90000,
  'middle': 220000,
  'senior': 400000,
  'teamlead': 520000,
  'architect': 680000,
  'cto': 1000000,
};

// Grade energy per day
export const GRADE_ENERGY: Record<Grade, number> = {
  'unemployed': 0,
  'intern': 3,
  'junior': 4,
  'middle': 4,
  'senior': 5,
  'teamlead': 5,
  'architect': 5,
  'cto': 5,
};

// Grade requirements (skill, communication, reputation)
export const GRADE_REQUIREMENTS: Record<Grade, { skill: number; comm: number; rep: number }> = {
  'unemployed': { skill: 0, comm: 0, rep: 0 },
  'intern': { skill: 18, comm: 8, rep: 0 },
  'junior': { skill: 32, comm: 14, rep: 5 },
  'middle': { skill: 55, comm: 26, rep: 15 },
  'senior': { skill: 76, comm: 42, rep: 30 },
  'teamlead': { skill: 80, comm: 55, rep: 42 },
  'architect': { skill: 90, comm: 68, rep: 58 },
  'cto': { skill: 95, comm: 80, rep: 70 },
};

// Grade ordering for comparison
export const GRADE_ORDER: Grade[] = [
  'unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'
];

/**
 * Get index of grade in career ladder
 */
export function careerLevelIndex(grade: Grade): number {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx >= 0 ? idx : 0;
}

/**
 * Get weekly salary (monthly / 4.3)
 */
export function weeklySalary(monthly: number): number {
  return Math.round(monthly / 4.3);
}

/**
 * Get daily food cost (section 5.6)
 */
export const FOOD_COOK = 350;
export const FOOD_DELIVERY = 1100;

/**
 * Housing costs per 30 days (section 5.6)
 */
export const HOUSING_COSTS: Record<number, number> = {
  0: 5000,    // dorm
  1: 25000,   // outskirts
  2: 50000,   // center
  3: 40000,   // own mortgage
  4: 150000,  // penthouse
};

/**
 * Housing motivation bonuses
 */
export const HOUSING_MOTIVATION: Record<number, number> = {
  0: 0,
  1: 0,
  2: 5,
  3: 10,
  4: 15,
};

/**
 * Housing reputation bonuses
 */
export const HOUSING_REPUTATION: Record<number, number> = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 10,
};

/**
 * Monthly fixed costs
 */
export const MONTHLY_COSTS = {
  internet: 2500,
  gym: 3000,
};

/**
 * Calculate freelance payment (section 6.5)
 */
export function freelancePayment(
  skill: number,
  reputation: number,
  difficulty: 'easy' | 'medium' | 'hard'
): number {
  const diffMult = { 'easy': 1, 'medium': 1.6, 'hard': 2.4 }[difficulty];
  const base = 3000 + skill * 380;
  const repMult = 1 + reputation / 60; // up to 2.67 at rep 100
  return Math.round(base * repMult * diffMult);
}

/**
 * Calculate theoretical max money for anti-cheat
 */
export function theoreticalMaxMoney(day: number): number {
  // Extremely generous upper bound
  return day * 200000;
}

/**
 * Check if player can afford rent
 */
export function canAffordRent(p: PlayerState): boolean {
  return p.money >= (HOUSING_COSTS[p.housingLevel] ?? 0);
}

/**
 * Daily motivation drift (section 4.4)
 * -0.5 per day unconditional
 * Health cap: motivation <= 40 + health * 0.6
 */
export function applyMotivationDrift(
  motivation: number,
  health: number,
  hasJob: boolean,
  jobMotivationPerDay: number
): { motivation: number; burnoutDays: number } {
  let newMot = motivation - 0.5; // daily drift

  // Job culture effect
  if (hasJob) {
    newMot += jobMotivationPerDay;
  }

  // Health cap
  const healthCap = 40 + health * 0.6;
  if (newMot > healthCap) {
    newMot = healthCap;
  }

  newMot = Math.max(0, Math.min(100, Math.round(newMot)));

  // Burnout tracking
  let burnoutDays = 0;
  if (newMot <= 0) {
    burnoutDays++;
  }

  return { motivation: newMot, burnoutDays };
}

/**
 * Apply health drift from work
 */
export function applyHealthDrift(
  health: number,
  jobHealthPerDay: number,
  foodType: 'cook' | 'delivery'
): number {
  let newHealth = health + jobHealthPerDay;

  if (foodType === 'cook') {
    newHealth += 1; // cooking is healthier
  }

  return Math.max(0, Math.min(100, Math.round(newHealth)));
}