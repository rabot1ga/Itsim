import { SkillLevel, PlayerState } from '../types';

/**
 * Skill system — sections 5.2, 5.3, 7
 */

/**
 * XP required to reach the next level — quadratic curve (section 5.2)
 * Formula: 8 * (1 + level/20)^2
 */
export function xpToNext(level: number): number {
  return Math.round(8 * Math.pow(1 + level / 20, 2));
}

/**
 * Apply XP to a skill with motivation multiplier
 */
export function applyXp(
  skill: SkillLevel,
  rawXp: number,
  motivation: number
): SkillLevel {
  const mult = 0.7 + 0.006 * motivation; // 0.7 .. 1.3
  let xp = skill.xp + Math.round(rawXp * mult);
  let level = skill.level;

  while (level < 100 && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }

  return { level, xp };
}

/**
 * Apply XP to a soft skill
 */
export function applySoftXp(
  skill: SkillLevel,
  rawXp: number
): SkillLevel {
  let xp = skill.xp + rawXp;
  let level = skill.level;

  while (level < 100 && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }

  return { level, xp };
}

/**
 * Motivation multiplier for XP gain
 */
export function motivationMult(motivation: number): number {
  return 0.7 + 0.006 * motivation;
}

/**
 * Check if player has access to a skill (parent gating — section 7.2)
 */
export function canLearnSkill(
  p: PlayerState,
  skillDef: { parent?: string; unlockAt?: Record<string, number> }
): boolean {
  if (!skillDef.parent && !skillDef.unlockAt) return true;

  if (skillDef.unlockAt) {
    for (const [parentId, requiredLevel] of Object.entries(skillDef.unlockAt)) {
      const parentLevel = p.skills[parentId]?.level ?? 0;
      if (parentLevel < requiredLevel) return false;
    }
  }

  return true;
}

/**
 * Check if player qualifies for a perk
 */
export function canUnlockPerk(
  p: PlayerState,
  requires: Record<string, number>
): boolean {
  for (const [key, requiredLevel] of Object.entries(requires)) {
    // Check if it's a branch requirement like "frontendBranch"
    if (key.endsWith('Branch')) {
      const branchName = key.replace('Branch', '');
      // Sum skill levels in the branch
      const branchSkills = Object.entries(p.skills)
        .filter(([k]) => k.startsWith(branchName) || k === branchName);
      const total = branchSkills.reduce((sum, [, v]) => sum + v.level, 0);
      if (total < requiredLevel) return false;
    } else if (key === 'communication' || key === 'leadership' || key === 'english' ||
               key === 'stress_resistance' || key === 'time_management' || key === 'public_speaking') {
      const softLevel = p.softSkills[key]?.level ?? 0;
      if (softLevel < requiredLevel) return false;
    } else {
      // It's a specific skill
      const skillLevel = p.skills[key]?.level ?? 0;
      if (skillLevel < requiredLevel) return false;
    }
  }
  return true;
}

/**
 * Calculate total skill levels across all skills
 */
export function totalSkillLevels(p: PlayerState): number {
  return Object.values(p.skills).reduce((sum, s) => sum + s.level, 0);
}

/**
 * Calculate total XP earned across all skills
 */
export function totalSkillXp(p: PlayerState): number {
  let totalXp = 0;
  for (const skill of Object.values(p.skills)) {
    totalXp += skill.xp;
    // Add XP spent on leveling up
    for (let i = 0; i < skill.level; i++) {
      totalXp += xpToNext(i);
    }
  }
  return totalXp;
}

/**
 * Get skill from player state, returning a default if not found
 */
export function getSkill(p: PlayerState, skillId: string): SkillLevel {
  return p.skills[skillId] ?? { level: 0, xp: 0 };
}

/**
 * Get the highest skill level across all skills
 * Used for grade requirement comparison
 */
export function maxSkillLevel(p: PlayerState): number {
  let max = 0;
  for (const skill of Object.values(p.skills)) {
    if (skill.level > max) max = skill.level;
  }
  return max;
}