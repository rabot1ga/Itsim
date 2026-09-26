import { PlayerState, MAX_CAREER_LEVEL, TOTAL_ACHIEVEMENTS } from '../types';
import { careerLevelIndex } from './economy';
import { totalSkillLevels } from './skills';

/**
 * Rating system — section 6.4
 *
 * Each component normalized to 0..100, then weighted.
 * Final score 0..1000 for leaderboard display.
 *
 * Components are a *public* part of the API: the leaderboard boards by metric
 * (`/api/leaderboard/...?metric=career`) sort by exactly these numbers, so the
 * formula lives here once and nowhere else. `calculateRating` is the weighted
 * sum of `ratingParts` — the two can not drift apart.
 */

/**
 * What goes into the score, in the order the sum is taken (float-identical to
 * the previous hand-written expression — board and HUD must agree).
 *
 * No labels here on purpose: wording belongs to the screen (the spec calls this
 * component "Rep", not "Репутация", and at 320 px that is layout, not
 * nitpicking), while the engine owns the numbers.
 */
export const RATING_COMPONENTS = [
  { id: 'career', weight: 0.28 },
  { id: 'skills', weight: 0.22 },
  { id: 'money', weight: 0.14 },
  { id: 'reputation', weight: 0.16 },
  { id: 'achievements', weight: 0.12 },
  { id: 'housing', weight: 0.08 },
] as const;

export type RatingComponent = (typeof RATING_COMPONENTS)[number]['id'];
/** A board can rank either by the total or by one component. */
export type RatingMetric = 'rating' | RatingComponent;
export const RATING_METRICS: readonly RatingMetric[] = ['rating', ...RATING_COMPONENTS.map((c) => c.id)];

/** Everything `ratingParts` reads — a full `PlayerState` satisfies it. */
export type RatingInput = Pick<
  PlayerState,
  'grade' | 'skills' | 'money' | 'reputation' | 'achievements' | 'housingLevel'
>;

/** Every component as 0..100, unrounded (boards sort on these, display rounds). */
export function ratingParts(p: RatingInput): Record<RatingComponent, number> {
  return {
    career: (careerLevelIndex(p.grade) / MAX_CAREER_LEVEL) * 100,
    skills: Math.min(100, totalSkillLevels(p) / 4),
    money: Math.min(100, Math.log10(Math.max(1, p.money)) * 14.3),
    reputation: p.reputation,
    achievements: Math.min(100, (p.achievements.length / TOTAL_ACHIEVEMENTS) * 100),
    housing: (p.housingLevel / 4) * 100,
  };
}

/** One number to rank by: the total (0..1000) or a component (0..100). */
export function ratingMetricOf(p: RatingInput, metric: RatingMetric): number {
  if (metric === 'rating') return calculateRating(p);
  return ratingParts(p)[metric];
}

export function calculateRating(p: RatingInput): number {
  const parts = ratingParts(p);
  const score = RATING_COMPONENTS.reduce((sum, c) => sum + parts[c.id] * c.weight, 0);

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
