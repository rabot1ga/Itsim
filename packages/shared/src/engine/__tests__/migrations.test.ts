import { describe, it, expect } from 'vitest';
import {
  migrateState,
  normalizeState,
  needsMigration,
  createNewPlayer,
  CURRENT_STATE_VERSION,
} from '../../index';

/**
 * Save migrations (engine/migrations.ts).
 *
 * The contract these tests protect: an old save must load without losing data,
 * running the migration twice must be a no-op, and a save from a future build
 * must never be silently rewritten.
 */

/** A v1 save as written by the MVP build (August 2026): no career-layer fields. */
function legacySave(): any {
  return {
    version: 1,
    currentDay: 42,
    grade: 'junior',
    money: 51000,
    health: 71,
    motivation: 44,
    energy: 6,
    maxEnergy: 11,
    reputation: 23,
    bankedDays: 2,
    skills: { javascript: { level: 12, xp: 40 }, react: { level: 7, xp: 10 } },
    perks: ['night_owl'],
    softSkills: { communication: { level: 9, xp: 3 } },
    job: { companyId: 'startup', position: 'Junior', grade: 'junior', salary: 90000, energyPerDay: 4, daysWorked: 20, daysSinceLastPromotion: 5 },
    jobWarnings: 0,
    pendingOffers: [],
    currentApplication: null,
    housingLevel: 1,
    items: ['cheap_headphones'],
    activeCourses: [],
    pendingEvents: [],
    eventHistory: {},
    relationships: {},
    activeFreelance: null,
    achievements: ['first_job'],
    totalActions: 130,
    daysSinceRegistration: 42,
    lastMotivationDrift: 41,
  };
}

describe('save migrations', () => {
  it('reports that a legacy save needs migrating', () => {
    expect(needsMigration(legacySave())).toBe(true);
    expect(needsMigration(createNewPlayer())).toBe(false);
  });

  it('upgrades a v1 save to the current version without losing progress', () => {
    const { state, applied, changed } = migrateState<any>(legacySave());

    expect(changed).toBe(true);
    expect(applied).toContain('v2_career_gates_and_cosmetics');
    expect(state.version).toBe(CURRENT_STATE_VERSION);

    // nothing the player earned disappears
    expect(state.money).toBe(51000);
    expect(state.skills.javascript.level).toBe(12);
    expect(state.achievements).toEqual(['first_job']);
    expect(state.job.salary).toBe(90000);
  });

  it('derives the main skill from the deepest trained skill', () => {
    const { state } = migrateState<any>(legacySave());
    expect(state.mainSkillId).toBe('javascript');
  });

  it('reconstructs lastPromotionDay from the job bookkeeping', () => {
    const { state } = migrateState<any>(legacySave());
    // day 42, promoted 5 days ago
    expect(state.lastPromotionDay).toBe(37);
  });

  it('fills the fields added after v1 with safe defaults', () => {
    const { state } = migrateState<any>(legacySave());
    expect(state.ctoCooldownUntilDay).toBe(0);
    expect(state.brokeDays).toBe(0);
    expect(state.burnoutDays).toBe(0);
    expect(state.recentEventTags).toEqual([]);
    expect(state.entitlements).toEqual([]);
    expect(state.badges).toEqual([]);
  });

  it('is idempotent — a second run changes nothing', () => {
    const first = migrateState<any>(legacySave());
    const second = migrateState<any>(first.state);
    expect(second.changed).toBe(false);
    expect(second.applied).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it('never mutates the input object', () => {
    const raw = legacySave();
    const snapshot = JSON.stringify(raw);
    migrateState(raw);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it('leaves a save from a newer build untouched', () => {
    const future = { ...createNewPlayer(), version: CURRENT_STATE_VERSION + 5, money: 777 };
    const { state, changed, fromFuture } = migrateState<any>(future);
    expect(fromFuture).toBe(true);
    expect(changed).toBe(false);
    expect(state.version).toBe(CURRENT_STATE_VERSION + 5);
    expect(state.money).toBe(777);
  });

  it('treats a save without a version as v1', () => {
    const { state, applied } = migrateState<any>({ ...legacySave(), version: undefined });
    expect(applied).toContain('v2_career_gates_and_cosmetics');
    expect(state.version).toBe(CURRENT_STATE_VERSION);
  });
});

describe('normalizeState', () => {
  it('repairs corrupt resource values instead of propagating NaN', () => {
    const state: any = {
      ...createNewPlayer(),
      health: 250,
      motivation: -40,
      money: Number.NaN,
      energy: 99,
      maxEnergy: 12,
      bankedDays: 400,
      currentDay: 0,
    };
    normalizeState(state);

    expect(state.health).toBe(100);
    expect(state.motivation).toBe(0);
    expect(state.money).toBe(0);
    expect(state.energy).toBe(12);
    expect(state.bankedDays).toBe(7);
    expect(state.currentDay).toBe(1);
  });

  it('upgrades ancient bare-number skill entries', () => {
    const state: any = { ...createNewPlayer(), skills: { python: 4 } };
    normalizeState(state);
    expect(state.skills.python).toEqual({ level: 4, xp: 0 });
  });

  it('restores missing soft skills with their starting values', () => {
    const state: any = { ...createNewPlayer(), softSkills: {} };
    normalizeState(state);
    expect(state.softSkills.communication.level).toBe(5);
    expect(state.softSkills.english.level).toBe(10);
  });

  it('is idempotent', () => {
    const state: any = { ...createNewPlayer(), health: 999, skills: { go: 3 } };
    normalizeState(state);
    const once = JSON.stringify(state);
    normalizeState(state);
    expect(JSON.stringify(state)).toBe(once);
  });
});
