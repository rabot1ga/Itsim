import { PlayerState } from '../types';
import { clamp } from './utils';

/**
 * Save-state migrations.
 *
 * Saves are JSON blobs written by whatever version of the engine happened to be
 * running that day. `state.version` existed from day one, but nothing ever acted
 * on it: adding a field to `PlayerState` silently produced `undefined`s inside
 * old saves, and the code coped with `?? 0` sprinkled everywhere.
 *
 * From now on every schema change gets a numbered migration here, and the server
 * runs `migrateState()` on load (and persists the result). Rules:
 *
 *  1. Migrations are pure and idempotent — running them twice must not change
 *     anything (they are also run in tests against real-world saves).
 *  2. They never delete data they cannot reconstruct; unknown/legacy keys are
 *     kept as-is so a rollback stays possible.
 *  3. A save from the FUTURE (version > CURRENT_STATE_VERSION) is left untouched
 *     and reported, so an accidental server downgrade cannot corrupt it.
 */

export const CURRENT_STATE_VERSION = 3;

export interface MigrationResult<T = PlayerState> {
  state: T;
  /** names of migrations applied, in order */
  applied: string[];
  /** true if the state object differs from the input (needs persisting) */
  changed: boolean;
  /** save written by a newer engine — left untouched */
  fromFuture: boolean;
}

interface Migration {
  to: number;
  name: string;
  up: (state: any) => void;
}

const MIGRATIONS: Migration[] = [
  {
    to: 2,
    name: 'v2_career_gates_and_cosmetics',
    /**
     * v1 → v2: the balance v2.1 career layer (main skill, review/election
     * bookkeeping, living costs) and the cosmetics layer (room/avatar/pet)
     * were added incrementally without defaults. Fill them in explicitly.
     */
    up(state: any) {
      if (typeof state.mainSkillId !== 'string' || !state.mainSkillId) {
        // Best guess: the deepest skill the player has actually trained.
        const best = Object.entries(state.skills ?? {})
          .map(([id, s]: [string, any]) => ({ id, level: s?.level ?? 0, xp: s?.xp ?? 0 }))
          .sort((a, b) => b.level - a.level || b.xp - a.xp)[0];
        state.mainSkillId = best?.id ?? 'javascript';
      }
      if (typeof state.lastPromotionDay !== 'number') {
        state.lastPromotionDay = state.job
          ? Math.max(0, (state.currentDay ?? 1) - (state.job.daysSinceLastPromotion ?? 0))
          : 0;
      }
      if (typeof state.ctoCooldownUntilDay !== 'number') state.ctoCooldownUntilDay = 0;
      if (typeof state.brokeDays !== 'number') state.brokeDays = 0;
      if (typeof state.burnoutDays !== 'number') state.burnoutDays = 0;
      if (typeof state.lastLivingCost !== 'number') state.lastLivingCost = 0;
      if (!Array.isArray(state.recentEventTags)) state.recentEventTags = [];
      if (!Array.isArray(state.perks)) state.perks = [];
      if (!Array.isArray(state.items)) state.items = [];
      if (!Array.isArray(state.achievements)) state.achievements = [];
      if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
      if (!Array.isArray(state.pendingOffers)) state.pendingOffers = [];
      if (!Array.isArray(state.activeCourses)) state.activeCourses = [];
      if (!state.eventHistory || typeof state.eventHistory !== 'object') state.eventHistory = {};
      if (!state.relationships || typeof state.relationships !== 'object') state.relationships = {};
      if (!state.skills || typeof state.skills !== 'object') state.skills = {};
      if (!state.softSkills || typeof state.softSkills !== 'object') state.softSkills = {};
    },
  },
  {
    to: 3,
    name: 'v3_freelance_bids',
    /**
     * v2 → v3: projects are no longer taken with a button, they are bid for
     * (`freelanceBid`, resolved at the turn of the day). Old saves simply have
     * no pending bid; an active project keeps running untouched.
     */
    up(state: any) {
      if (state.freelanceBid === undefined) state.freelanceBid = null;
    },
  },
];

const SOFT_SKILL_DEFAULTS: Record<string, { level: number; xp: number }> = {
  communication: { level: 5, xp: 0 },
  english: { level: 10, xp: 0 },
  time_management: { level: 3, xp: 0 },
};

/**
 * Repairs that must hold for EVERY save regardless of version: shape of the
 * required collections, resource clamps, no NaN. Idempotent by construction.
 */
export function normalizeState(state: any): void {
  for (const key of ['skills', 'softSkills', 'eventHistory', 'relationships'] as const) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
  }
  for (const key of [
    'perks',
    'items',
    'achievements',
    'pendingEvents',
    'pendingOffers',
    'activeCourses',
    'recentEventTags',
    'entitlements',
    'badges',
  ] as const) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  for (const [id, def] of Object.entries(SOFT_SKILL_DEFAULTS)) {
    const cur = state.softSkills[id];
    if (!cur || typeof cur.level !== 'number' || !Number.isFinite(cur.level)) state.softSkills[id] = { ...def };
    else if (typeof cur.xp !== 'number' || !Number.isFinite(cur.xp)) cur.xp = 0;
  }

  const num = (value: any, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  state.currentDay = Math.max(1, Math.floor(num(state.currentDay, 1)));
  state.money = Math.max(0, Math.round(num(state.money, 0)));
  state.health = clamp(num(state.health, 80), 0, 100);
  state.motivation = clamp(num(state.motivation, 50), 0, 100);
  state.reputation = clamp(num(state.reputation, 0), 0, 100);
  state.maxEnergy = clamp(num(state.maxEnergy, 10), 3, 30);
  state.energy = clamp(num(state.energy, state.maxEnergy), 0, state.maxEnergy);
  state.bankedDays = clamp(num(state.bankedDays, 0), 0, 7);
  state.housingLevel = clamp(Math.floor(num(state.housingLevel, 0)), 0, 5);
  state.totalActions = Math.max(0, Math.floor(num(state.totalActions, 0)));
  state.daysSinceRegistration = Math.max(1, Math.floor(num(state.daysSinceRegistration, 1)));
  state.jobWarnings = Math.max(0, Math.floor(num(state.jobWarnings, 0)));

  // A bid without a project id is noise the day cycle would trip over.
  const bid = state.freelanceBid;
  if (bid && (typeof bid.projectId !== 'string' || !bid.projectId)) state.freelanceBid = null;
  else if (bid) {
    bid.chance = clamp(num(bid.chance, 0.3), 0, 1);
    bid.day = Math.max(1, Math.floor(num(bid.day, state.currentDay)));
  } else if (bid === undefined) state.freelanceBid = null;

  // Skill entries can arrive as bare numbers from very old saves
  for (const [id, value] of Object.entries(state.skills as Record<string, any>)) {
    if (typeof value === 'number') state.skills[id] = { level: value, xp: 0 };
    else if (!value || typeof value.level !== 'number') delete state.skills[id];
  }
}

/**
 * Bring a persisted save up to `CURRENT_STATE_VERSION`.
 * Mutates a *copy*: the input object is never modified.
 */
export function migrateState<T = PlayerState>(raw: any): MigrationResult<T> {
  const before = JSON.stringify(raw);
  const state = JSON.parse(before);
  const applied: string[] = [];

  const version = typeof state.version === 'number' && Number.isFinite(state.version) ? state.version : 1;

  if (version > CURRENT_STATE_VERSION) {
    return { state, applied, changed: false, fromFuture: true };
  }

  for (const migration of MIGRATIONS) {
    if (version < migration.to) {
      migration.up(state);
      state.version = migration.to;
      applied.push(migration.name);
    }
  }
  state.version = CURRENT_STATE_VERSION;

  normalizeState(state);

  return { state, applied, changed: JSON.stringify(state) !== before, fromFuture: false };
}

/** True when the save would be changed by `migrateState` (cheap pre-check). */
export function needsMigration(raw: any): boolean {
  const version = typeof raw?.version === 'number' ? raw.version : 1;
  return version < CURRENT_STATE_VERSION;
}
