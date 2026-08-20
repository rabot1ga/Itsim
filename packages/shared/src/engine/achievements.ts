import { PlayerState, AchievementDefinition, AchievementCondition } from '../types';
import { gradeToIndex } from './player';

/**
 * Achievement system — section 6.6
 */

/**
 * Check whether a single achievement condition is met
 */
export function isAchievementEarned(p: PlayerState, cond: AchievementCondition): boolean {
  switch (cond.type) {
    case 'grade_reached':
      return gradeToIndex(p.grade) >= gradeToIndex(String(cond.target));

    case 'money_made':
      return p.money >= Number(cond.target);

    case 'skill_level': {
      const target = Number(cond.target);
      return Object.values(p.skills).some(s => s.level >= target);
    }

    case 'days_survived':
      return p.currentDay >= Number(cond.target);

    case 'events_seen': {
      const seen = Object.values(p.eventHistory).reduce((sum, h) => sum + h.count, 0);
      return seen >= Number(cond.target);
    }

    case 'special': {
      switch (cond.target) {
        case 'fullstack':
          return ['javascript', 'python'].every(id => (p.skills[id]?.level ?? 0) >= 30);
        case 'burnout':
          return (p.burnoutDays ?? 0) >= 5;
        case 'reputation_80':
          return p.reputation >= 80;
        case 'mining_100k':
          return (p.miningEarned ?? 0) >= 100000;
        case 'mining_1m':
          return (p.miningEarned ?? 0) >= 1000000;
        default:
          return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Check all achievements, award newly earned ones (mutates state)
 * Returns the list of newly earned definitions (for UI messages)
 */
export function checkAchievements(
  p: PlayerState,
  defs: AchievementDefinition[]
): AchievementDefinition[] {
  const newlyEarned: AchievementDefinition[] = [];

  for (const def of defs) {
    if (p.achievements.includes(def.id)) continue;
    if (isAchievementEarned(p, def.condition)) {
      p.achievements.push(def.id);
      newlyEarned.push(def);
    }
  }

  return newlyEarned;
}
