import { PlayerState, GameEvent, EventChoice } from '../types';
import { clamp, weightedPick } from './utils';
import { applyXp, applySoftXp } from './skills';

/** Soft skills that live in PlayerState.softSkills (not .skills) */
const SOFT_SKILL_IDS = new Set([
  'communication',
  'english',
  'time_management',
  'leadership',
  'stress_resistance',
  'public_speaking',
]);

/**
 * Event engine — sections 9.2, 9.4
 */

/**
 * Check if event conditions match player state
 */
export function checkConditions(
  conditions: GameEvent['conditions'] | undefined,
  p: PlayerState
): boolean {
  if (!conditions) return true;

  if (conditions.hasJob !== undefined) {
    const hasJob = p.job !== null;
    if (conditions.hasJob !== hasJob) return false;
  }

  if (conditions.weekday && !conditions.weekday.includes(p.currentDay % 7)) {
    return false;
  }

  if (conditions.minGrade) {
    const gradeOrder = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];
    if (gradeOrder.indexOf(p.grade) < gradeOrder.indexOf(conditions.minGrade)) return false;
  }

  if (conditions.maxGrade) {
    const gradeOrder = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];
    if (gradeOrder.indexOf(p.grade) > gradeOrder.indexOf(conditions.maxGrade)) return false;
  }

  if (conditions.minSkill) {
    for (const [skillId, level] of Object.entries(conditions.minSkill)) {
      if ((p.skills[skillId]?.level ?? 0) < level) return false;
    }
  }

  if (conditions.minMoney !== undefined && p.money < conditions.minMoney) return false;
  if (conditions.maxMoney !== undefined && p.money > conditions.maxMoney) return false;

  if (conditions.minHealth !== undefined && p.health < conditions.minHealth) return false;
  if (conditions.maxHealth !== undefined && p.health > conditions.maxHealth) return false;

  if (conditions.minMotivation !== undefined && p.motivation < conditions.minMotivation) return false;
  if (conditions.maxMotivation !== undefined && p.motivation > conditions.maxMotivation) return false;

  if (conditions.minReputation !== undefined && p.reputation < conditions.minReputation) return false;

  if (conditions.hasItem && !p.items.includes(conditions.hasItem)) return false;

  if (conditions.npcPresent && !(conditions.npcPresent in p.relationships)) return false;

  if (conditions.minRelation) {
    for (const [npcId, rel] of Object.entries(conditions.minRelation)) {
      if ((p.relationships[npcId] ?? 0) < rel) return false;
    }
  }

  if (conditions.maxRelation) {
    for (const [npcId, rel] of Object.entries(conditions.maxRelation)) {
      if ((p.relationships[npcId] ?? 0) > rel) return false;
    }
  }

  if (conditions.notEventRecently) {
    const recentIds = Object.keys(p.eventHistory).slice(-5);
    for (const eventId of conditions.notEventRecently) {
      if (recentIds.includes(eventId)) return false;
    }
  }

  return true;
}

/**
 * Pick an event from pool — section 9.4 algorithm
 */
export function pickEvent(
  p: PlayerState,
  pool: GameEvent[],
  rng: () => number
): GameEvent | null {
  // 1. Pending chain events have absolute priority
  const pending = p.pendingEvents.find(e => e.triggerDay <= p.currentDay);
  if (pending) {
    const event = pool.find(e => e.id === pending.eventId);
    if (event) return event;
  }

  // 2. Filter eligible events (chain-only events are excluded from the random pool)
  const eligible = pool.filter(e => {
    if (e.chainOnly) return false;

    const hist = p.eventHistory[e.id];
    const lastDay = hist?.lastDay ?? -999;
    const count = hist?.count ?? 0;
    const maxOcc = e.maxOccurrences ?? Infinity;

    return (
      checkConditions(e.conditions, p) &&
      p.currentDay >= (e.minGameDay ?? 0) &&
      p.currentDay - lastDay >= e.cooldownDays &&
      count < maxOcc
    );
  });

  if (eligible.length === 0) return null;

  // 3. Anti-repetition: reduce weight if tags repeat recently
  const recentTags = p.recentEventTags.slice(-3);
  const weighted = eligible.map(e => ({
    event: e,
    weight: e.tags.some(t => recentTags.includes(t))
      ? e.weight * 0.35
      : e.weight,
  }));

  return weightedPick(weighted, rng)?.event ?? null;
}

/**
 * Apply event effects to player state.
 * Returns a NEW state object (shallow copy) — the caller must use the result.
 */
export function applyEventEffects(
  p: PlayerState,
  choice: EventChoice
): PlayerState {
  const e = choice.effects;
  if (!e) return p;

  const next: PlayerState = { ...p };

  // Apply numeric effects
  if (e.energy !== undefined) next.energy = clamp(next.energy + e.energy, 0, next.maxEnergy);
  if (e.money !== undefined) next.money = Math.max(0, next.money + e.money);
  if (e.health !== undefined) next.health = clamp(next.health + e.health, 0, 100);
  if (e.motivation !== undefined) next.motivation = clamp(next.motivation + e.motivation, 0, 100);
  if (e.reputation !== undefined) next.reputation = clamp(next.reputation + e.reputation, 0, 100);
  if (e.karma !== undefined) { /* karma is tracking only, no gameplay effect yet */ }

  // Skill effects — XP goes through the normal leveling curve
  if (e.skill) {
    next.skills = { ...next.skills };
    next.softSkills = { ...next.softSkills };
    for (const [skillId, rawXp] of Object.entries(e.skill)) {
      if (SOFT_SKILL_IDS.has(skillId)) {
        const current = next.softSkills[skillId] ?? { level: 0, xp: 0 };
        next.softSkills[skillId] = applySoftXp(current, rawXp);
      } else {
        const current = next.skills[skillId] ?? { level: 0, xp: 0 };
        next.skills[skillId] = applyXp(current, rawXp, next.motivation);
      }
    }
  }

  // Relation effects
  if (e.relation) {
    next.relationships = { ...next.relationships };
    for (const [npcId, delta] of Object.entries(e.relation)) {
      const current = next.relationships[npcId] ?? 0;
      next.relationships[npcId] = clamp(current + delta, -100, 100);
    }
  }

  // Job warnings
  if (e.jobWarnings !== undefined) {
    next.jobWarnings = (next.jobWarnings ?? 0) + e.jobWarnings;
  }

  // Burnout days
  if (e.burnoutDays !== undefined) {
    next.burnoutDays = Math.max(0, (next.burnoutDays ?? 0) + e.burnoutDays);
  }

  return next;
}

/**
 * Get event probability for a given day range (section 9.5)
 */
export function eventChancePerDay(gameDay: number): number {
  if (gameDay <= 10) return 0.20;
  if (gameDay <= 60) return 0.35;
  if (gameDay <= 150) return 0.28;
  return 0.20;
}