import { PlayerState } from '../types';

/**
 * Archetype builds (roadmap P1.3) — «Путь фронтендера» and friends.
 *
 * The skill galaxy shows every skill at once, which is freedom and a wall at
 * the same time: nothing whispers what a coherent build looks like. An
 * archetype is one curated route through the tree — an ordered chain of
 * (skill → level) milestones that mostly follows real dependency edges — with
 * a one-time-per-life bonus for walking all the way to the end.
 *
 * Progress is NOT stored: it is derived from the player's skill levels every
 * time, so the server can never disagree with the map, and a prestige reset
 * (which clears skills) naturally re-arms the bonus for the next life.
 *
 * Content shape (content/archetypes.json):
 *   { archetypes: [{ id, title, subtitle, reward: {money?, reputation?},
 *                    nodes: [{ skillId, level }] }] }
 */

export interface ArchetypeStepDef {
  skillId: string;
  /** level this milestone wants that skill at */
  level: number;
}

export interface ArchetypeDef {
  id: string;
  title: string;
  subtitle?: string;
  reward: { money?: number; reputation?: number };
  nodes: ArchetypeStepDef[];
}

export type SkillLevels = Record<string, number>;

/** Step achieved? */
export function archetypeStepDone(step: ArchetypeStepDef, levels: SkillLevels): boolean {
  return (levels[step.skillId] ?? 0) >= step.level;
}

/** Index of the first unfinished milestone, or null when the route is complete. */
export function archetypeNextStep(def: ArchetypeDef, levels: SkillLevels): number | null {
  const i = def.nodes.findIndex((s) => !archetypeStepDone(s, levels));
  return i === -1 ? null : i;
}

export function archetypeDone(def: ArchetypeDef, levels: SkillLevels): boolean {
  return archetypeNextStep(def, levels) === null;
}

/** Bonus still available? (done + not yet claimed in this life) */
export function archetypeClaimable(def: ArchetypeDef, levels: SkillLevels, bonuses: string[] | undefined): boolean {
  return !(bonuses ?? []).includes(def.id) && archetypeDone(def, levels);
}

/** Steps annotated with live level + done flag (for the client view). */
export interface ArchetypeStepView {
  skillId: string;
  skillName?: string;
  target: number;
  level: number;
  done: boolean;
}

export interface ArchetypeView {
  id: string;
  title: string;
  subtitle: string;
  /** ordered chain; first `done === false` index is the current goal */
  steps: ArchetypeStepView[];
  allDone: boolean;
  claimed: boolean;
  reward: { money: number; reputation: number };
}

/** Client-ready projection of one archetype against the player's levels. */
export function archetypeToView(
  def: ArchetypeDef,
  levels: SkillLevels,
  bonuses: string[] | undefined,
  nameOf?: (skillId: string) => string
): ArchetypeView {
  return {
    id: def.id,
    title: def.title,
    subtitle: def.subtitle ?? '',
    steps: def.nodes.map((s) => ({
      skillId: s.skillId,
      skillName: nameOf ? nameOf(s.skillId) : s.skillId,
      target: s.level,
      level: levels[s.skillId] ?? 0,
      done: archetypeStepDone(s, levels),
    })),
    allDone: archetypeDone(def, levels),
    claimed: (bonuses ?? []).includes(def.id),
    reward: {
      money: def.reward?.money ?? 0,
      reputation: def.reward?.reputation ?? 0,
    },
  };
}

/**
 * Which archetype bonuses are newly claimable after an action that just
 * raised skills (call with the levels BEFORE and AFTER the action).
 */
export function newlyClaimableArchetypes(
  defs: ArchetypeDef[] | undefined,
  before: SkillLevels,
  after: SkillLevels,
  bonuses: string[] | undefined
): ArchetypeDef[] {
  if (!defs) return [];
  return defs.filter((def) => !archetypeDone(def, before) && archetypeClaimable(def, after, bonuses));
}

/** Re-validate a claim on the server: exists, done, not claimed this life. */
export function validateArchetypeClaim(
  defs: ArchetypeDef[] | undefined,
  archetypeId: string | undefined,
  state: Pick<PlayerState, 'skills'> & { archetypeBonuses?: string[] }
): { def: ArchetypeDef } | { error: string } {
  const def = (defs ?? []).find((a) => a.id === archetypeId);
  if (!def) return { error: 'Такого пути нет' };
  const levels: SkillLevels = {};
  for (const [id, v] of Object.entries(state.skills ?? {})) levels[id] = (v as { level?: number })?.level ?? 0;
  if (!archetypeDone(def, levels)) return { error: 'Пройди все шаги пути до конца' };
  if ((state.archetypeBonuses ?? []).includes(def.id)) return { error: 'Бонус этого пути уже получен' };
  return { def };
}
