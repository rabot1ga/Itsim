import { describe, it, expect } from 'vitest';
import {
  sprintWeekStartMs,
  sprintWeekEndsAtMs,
  sprintWeekKey,
  sprintWeekIndex,
  sprintDaysLeft,
  activeSprintTheme,
  rollSprint,
  bumpSprintProgress,
  sprintAllDone,
  type SprintThemeDef,
} from '../sprint';
import { PlayerSprint } from '../../types';

/**
 * Fixed instants around the UTC+3 week boundary.
 * 2026-09-07 00:00 UTC+3 == 2026-09-06 21:00 UTC — that is a Monday in the
 * sprint calendar. 2026-09-13 23:59:59 UTC+3 is Sunday, the last moment of
 * the week (2026-09-13 = the Sunday of that same week).
 */
const MONDAY_UTC3 = Date.parse('2026-09-07T00:00:00+03:00'); // = 2026-09-06T21:00Z
const SUNDAY_END = Date.parse('2026-09-13T23:59:59.999+03:00');
const NEXT_MONDAY = Date.parse('2026-09-14T00:00:00+03:00');

const THEMES: SprintThemeDef[] = [
  {
    id: 'learn',
    title: 'Неделя прокачки',
    icon: 'cap',
    goals: [
      { id: 'study', prefix: 'study_', count: 3, description: 'учебных действий' },
      { id: 'network', prefix: 'networking', count: 1, description: 'нетворкингов' },
    ],
    reward: { money: 5000 },
  },
  {
    id: 'money',
    title: 'Неделя денег',
    icon: 'coin',
    goals: [{ id: 'work', prefix: 'work_', count: 2, description: 'рабочих задач' }],
    reward: { money: 9000 },
  },
  {
    id: 'balance',
    title: 'Неделя баланса',
    icon: 'walk',
    goals: [{ id: 'rest', prefix: 'rest_', count: 4, description: 'отдыхов' }],
    reward: { money: 4000 },
  },
];

describe('sprint week window (UTC+3 Monday→Sunday)', () => {
  it('Monday 00:00 UTC+3 starts a week', () => {
    expect(sprintWeekStartMs(MONDAY_UTC3)).toBe(MONDAY_UTC3);
    expect(sprintWeekEndsAtMs(MONDAY_UTC3)).toBe(NEXT_MONDAY);
    expect(sprintWeekKey(MONDAY_UTC3)).toBe('2026-09-07');
    expect(sprintDaysLeft(MONDAY_UTC3)).toBe(6);
  });

  it('a mid-week instant stays inside its own week', () => {
    const mid = Date.parse('2026-09-10T14:30:00+03:00'); // Thursday
    expect(sprintWeekStartMs(mid)).toBe(MONDAY_UTC3);
    expect(sprintWeekEndsAtMs(mid)).toBe(NEXT_MONDAY);
    expect(sprintWeekKey(mid)).toBe('2026-09-07');
    expect(sprintDaysLeft(mid)).toBe(3);
  });

  it('the last moment of Sunday still belongs to the week', () => {
    expect(sprintWeekStartMs(SUNDAY_END)).toBe(MONDAY_UTC3);
    expect(sprintDaysLeft(SUNDAY_END)).toBe(0);
  });

  it('Monday 00:00 UTC+3 rolls into the next week', () => {
    expect(sprintWeekStartMs(NEXT_MONDAY)).toBe(NEXT_MONDAY);
    expect(sprintWeekKey(NEXT_MONDAY)).toBe('2026-09-14');
    expect(sprintDaysLeft(NEXT_MONDAY)).toBe(6);
  });

  it('Monday 2026-09-07 (UTC+3) is exactly one week after Monday 2026-08-31', () => {
    const prev = Date.parse('2026-08-31T00:00:00+03:00');
    expect(sprintWeekStartMs(prev)).toBe(prev);
    expect(sprintWeekStartMs(NEXT_MONDAY) - sprintWeekStartMs(prev)).toBe(2 * 7 * 24 * 3600 * 1000);
    expect(sprintWeekIndex(NEXT_MONDAY) - sprintWeekIndex(prev)).toBe(2);
  });

  it('the boundary is timezone-fixed: 2026-09-06T22:00Z is still Sunday night UTC+3…', () => {
    // 2026-09-06T22:00Z == 2026-09-07T01:00 UTC+3 → already Monday
    const lateSundayUtc = Date.parse('2026-09-06T22:00:00Z');
    expect(sprintWeekKey(lateSundayUtc)).toBe('2026-09-07');
    // …while 2026-09-06T20:59:59Z == 2026-09-06T23:59:59 UTC+3 is still Sunday
    const stillSundayUtc = Date.parse('2026-09-06T20:59:59Z');
    expect(sprintWeekKey(stillSundayUtc)).toBe('2026-08-31');
  });
});

describe('theme rotation', () => {
  it('cycles themes week by week, deterministically', () => {
    const t0 = activeSprintTheme(THEMES, MONDAY_UTC3)!;
    const t1 = activeSprintTheme(THEMES, NEXT_MONDAY)!;
    const t2 = activeSprintTheme(THEMES, Date.parse('2026-09-21T00:00:00+03:00'))!;
    const t3 = activeSprintTheme(THEMES, Date.parse('2026-09-28T00:00:00+03:00'))!;
    expect([t0.id, t1.id, t2.id, t3.id]).toEqual(['learn', 'money', 'balance', 'learn']);
  });

  it('returns null when content has no themes', () => {
    expect(activeSprintTheme(undefined, MONDAY_UTC3)).toBeNull();
    expect(activeSprintTheme([], MONDAY_UTC3)).toBeNull();
  });
});

describe('player sprint record', () => {
  it('creates a fresh record for the current week (theme learn is week 2026-09-07)', () => {
    const rec = rollSprint(undefined, THEMES, MONDAY_UTC3);
    expect(rec).toEqual({ week: '2026-09-07', themeId: 'learn', progress: {}, claimed: false });
  });

  it('keeps the record untouched mid-week', () => {
    const stored: PlayerSprint = {
      week: '2026-09-07',
      themeId: 'learn',
      progress: { study: 1 },
      claimed: false,
    };
    expect(rollSprint(stored, THEMES, MONDAY_UTC3)).toBe(stored);
  });

  it('rolls a stale record into the new week with empty progress', () => {
    const stale: PlayerSprint = { week: '2026-08-31', themeId: 'balance', progress: { rest: 4 }, claimed: false };
    const rec = rollSprint(stale, THEMES, NEXT_MONDAY)!;
    expect(rec.week).toBe('2026-09-14');
    expect(rec.themeId).toBe('money');
    expect(rec.progress).toEqual({});
    expect(rec.claimed).toBe(false);
  });
});

describe('progress bumps (week of 2026-09-14 has theme money)', () => {
  const base: PlayerSprint = { week: '2026-09-14', themeId: 'money', progress: {}, claimed: false };

  it('counts matching actions and ignores everything else', () => {
    let cur = base;
    const bump = (id: string) => (cur = bumpSprintProgress(cur, THEMES, id, NEXT_MONDAY)!.sprint);
    bump('work_task');
    expect(cur.progress).toEqual({ work: 1 });
    bump('study_youtube'); // wrong theme goal
    expect(cur.progress).toEqual({ work: 1 });
    bump('freelance'); // not a work_ prefix
    expect(cur.progress).toEqual({ work: 1 });
    bump('work_overtime');
    expect(cur.progress).toEqual({ work: 2 });
    expect(sprintAllDone(THEMES[1], cur)).toBe(true);
  });

  it('caps progress at the goal count', () => {
    let cur = bumpSprintProgress(base, THEMES, 'work_task', NEXT_MONDAY)!.sprint;
    cur = bumpSprintProgress(cur, THEMES, 'work_task', NEXT_MONDAY)!.sprint;
    cur = bumpSprintProgress(cur, THEMES, 'work_task', NEXT_MONDAY)!.sprint;
    expect(cur.progress.work).toBe(2);
  });

  it('reports doneJustNow exactly when the last goal completes', () => {
    const cur = base;
    const r1 = bumpSprintProgress(cur, THEMES, 'work_task', NEXT_MONDAY)!;
    expect(r1.doneJustNow).toBe(false);
    const r2 = bumpSprintProgress(r1.sprint, THEMES, 'work_task', NEXT_MONDAY)!;
    expect(r2.doneJustNow).toBe(true);
    const r3 = bumpSprintProgress(r2.sprint, THEMES, 'work_overtime', NEXT_MONDAY)!;
    expect(r3.doneJustNow).toBe(false);
  });

  it('stops ticking after the reward was claimed', () => {
    const claimed: PlayerSprint = { ...base, progress: { work: 2 }, claimed: true };
    const r = bumpSprintProgress(claimed, THEMES, 'work_task', NEXT_MONDAY)!;
    expect(r.sprint.progress.work).toBe(2);
  });

  it('a learn-week counts study and networking goals, not work', () => {
    let cur = rollSprint(undefined, THEMES, MONDAY_UTC3)!;
    cur = bumpSprintProgress(cur, THEMES, 'study_book', MONDAY_UTC3)!.sprint;
    cur = bumpSprintProgress(cur, THEMES, 'networking', MONDAY_UTC3)!.sprint;
    expect(cur.progress).toEqual({ study: 1, network: 1 });
    cur = bumpSprintProgress(cur, THEMES, 'work_task', MONDAY_UTC3)!.sprint;
    expect(cur.progress).toEqual({ study: 1, network: 1 });
    expect(sprintAllDone(THEMES[0], cur)).toBe(false); // study needs 3
  });
});
