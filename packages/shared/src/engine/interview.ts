import { InterviewInput } from '../types';
import { clamp } from './utils';

/**
 * Interview system — sections 6.3, 11
 *
 * Returns a deterministic chance (5..95) WITHOUT built-in randomness.
 * Caller uses rollInterview() with injected RNG for the actual roll.
 */

/**
 * Calculate interview success chance
 */
export function interviewChance(i: InterviewInput): number {
  const keys = Object.keys(i.requirements);
  if (keys.length === 0) return 50; // no requirements = coin flip

  // 1. Weighted match. Over-skill gives max 1.15 per requirement.
  let match = 0;
  let hardFail = false;

  for (const k of keys) {
    const have = i.skills[k] ?? 0;
    const need = i.requirements[k];
    const ratio = have / need;
    if (ratio < 0.5) hardFail = true;
    match += Math.min(ratio, 1.15);
  }
  match /= keys.length;

  // 2. Base: 0.5 match → 10%, 1.0 → 65%, 1.15 → 80%
  let chance = Math.max(0, (match - 0.4) / 0.75) * 65 + 5;

  // 3. Communication as multiplier (0.85..1.15)
  chance *= 0.85 + (i.communication / 100) * 0.3;

  // 4. Reputation bonus (up to +10)
  chance += i.reputation * 0.1;

  // 5. Answer score from mini-game (0.7..1.2)
  chance *= 0.7 + i.answerScore * 0.5;

  // 6. Company bar
  chance /= i.companyBar;

  // 7. Hard fail penalty
  if (hardFail) chance *= 0.35;

  return clamp(chance, 5, 95);
}

/**
 * Roll an interview with injected RNG (section 6.3)
 */
export function rollInterview(chance: number, rng: () => number): boolean {
  return rng() * 100 < chance;
}

/**
 * Pre-screening phase (section 11.2)
 */
export function preScreenMatch(
  skills: Record<string, number>,
  requirements: Record<string, number>
): number {
  const keys = Object.keys(requirements);
  if (keys.length === 0) return 1;

  let match = 0;
  for (const k of keys) {
    const have = skills[k] ?? 0;
    const need = requirements[k];
    match += Math.min(have / need, 1.15);
  }
  return match / keys.length;
}

/**
 * Get pre-screening result message
 */
export function preScreenResult(match: number): { passed: boolean; msg: string; answerScoreBonus: number } {
  if (match < 0.5) {
    return {
      passed: false,
      msg: 'Ваше резюме не прошло первичный отбор. Даже не открыли.',
      answerScoreBonus: 0,
    };
  }
  if (match < 0.8) {
    return {
      passed: true,
      msg: 'Собеседование назначено. Шансы средние — готовьтесь.',
      answerScoreBonus: 0,
    };
  }
  return {
    passed: true,
    msg: 'Ты явно сильнее позиции — интервьюер расслаблен.',
    answerScoreBonus: 0.1,
  };
}

/**
 * English level gating for foreign companies (section 7.4)
 */
export function englishAccessMultiplier(englishLevel: number): { hidden: boolean; chanceMult: number } {
  if (englishLevel < 30) {
    return { hidden: true, chanceMult: 0 };
  }
  if (englishLevel < 60) {
    return { hidden: false, chanceMult: 0.75 };
  }
  return { hidden: false, chanceMult: 1.8 };
}