import { describe, expect, it } from 'vitest';
import { ACTIONS, REST_ACTIONS, STUDY_ACTIONS, WORK_ACTIONS, formatMoney } from '../actionCatalogue';

/**
 * The catalogue is the contract between the tabs: every action belongs to
 * exactly one screen, and no id may drift from the server's action list.
 */
describe('action catalogue', () => {
  it('gives every action a unique id', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('splits the day across the tabs without losing an action', () => {
    expect(STUDY_ACTIONS.length + WORK_ACTIONS.length + REST_ACTIONS.length).toBe(ACTIONS.length);
    expect(STUDY_ACTIONS.every((a) => a.id.startsWith('study_'))).toBe(true);
    // Отдых and «социальное» share one tab — both restore mood.
    expect(REST_ACTIONS.map((a) => a.id)).toContain('rest_sleep');
    expect(REST_ACTIONS.map((a) => a.id)).toContain('networking');
  });

  it('marks the actions that only exist with a job', () => {
    expect(WORK_ACTIONS.filter((a) => a.requiresJob).map((a) => a.id)).toEqual(['work_task', 'work_overtime']);
    expect(WORK_ACTIONS.find((a) => a.id === 'freelance')?.requiresJob).toBeUndefined();
  });

  it('keeps sleep free so a flat battery is never a dead end', () => {
    const sleep = ACTIONS.find((a) => a.id === 'rest_sleep')!;
    expect(sleep.energy).toBe(0);
    expect(sleep.cost).toBe(0);
  });

  it('formats money the way the chips show it', () => {
    expect(formatMoney(500)).toBe('500');
    expect(formatMoney(15000)).toBe('15 тыс');
    expect(formatMoney(2_000_000)).toBe('2.0 млн');
  });
});
