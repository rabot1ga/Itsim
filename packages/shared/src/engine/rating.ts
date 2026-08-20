import { PlayerState, MAX_CAREER_LEVEL, TOTAL_ACHIEVEMENTS } from '../types';
import { careerLevelIndex } from './economy';
import { totalSkillLevels } from './skills';

/**
 * Rating system — section 6.4
 *
 * Each component normalized to 0..100, then weighted.
 * Final score 0..1000 for leaderboard display.
 */

export function calculateRating(p: PlayerState): number {
  // Career: 0..100
  const career = (careerLevelIndex(p.grade) / MAX_CAREER_LEVEL) * 100;

  // Skills: total level / 4, capped at 100 (400 total = max)
  const skills = Math.min(100, totalSkillLevels(p) / 4);

  // Money: log10 based, ~10M = 100
  const money = Math.min(100, Math.log10(Math.max(1, p.money)) * 14.3);

  // Reputation: 0..100
  const rep = p.reputation;

  // Achievements
  const achieve = Math.min(100, (p.achievements.length / TOTAL_ACHIEVEMENTS) * 100);

  // Life (housing)
  const life = (p.housingLevel / 4) * 100;

  const score =
    career  * 0.28 +
    skills  * 0.22 +
    money   * 0.14 +
    rep     * 0.16 +
    achieve * 0.12 +
    life    * 0.08;

  return Math.round(score * 10); // 0..1000
}

/**
 * Calculate XP required for maximum theoretical score at given day
 * Used for anti-cheat anomaly detection
 */
export function theoreticalMaxRatingXp(day: number): number {
  // Max ~100 skill levels * roughly 12500 XP each = ~1.25M
  // Realistic: ~20 XP per action, ~5 actions/day = 100 XP/day
  return day * 100 * 1.5; // 1.5x buffer for boosts
}