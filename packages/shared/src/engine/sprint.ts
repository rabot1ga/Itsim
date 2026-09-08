import { PlayerSprint } from '../types';

/**
 * Weekly season sprint (roadmap P1.2) — real-time retention layer.
 *
 * The game's day loop is calendar-agnostic, which means a player can go
 * several *real* days without opening the app and miss nothing (banked days
 * even reward it). The sprint adds the missing real-time hook: every real
 * week (Monday → Sunday, fixed to UTC+3 — the same game-day timezone as the
 * check-in) one theme rotates in from content, with goals that count matching
 * actions the player actually does that week. Completing all goals unlocks a
 * weekly reward claimable once — if the week ends unclaimed, it is gone.
 *
 * All functions are pure over `nowMs`, so the server never needs a scheduler:
 * the same code rolls the week on a state read, on an action, and on a claim.
 *
 * Content shape (content/sprints.json):
 *   { themes: [{ id, title, subtitle, icon,
 *                goals: [{ id, prefix, count, description }],
 *                reward: { money?, motivation?, reputation? } }] }
 */

/** sprint window timezone: UTC+3 (same as gameDate in checkIn) */
export const SPRINT_TZ_MS = 3 * 3600 * 1000;
export const SPRINT_DAY_MS = 24 * 3600 * 1000;
export const SPRINT_WEEK_MS = 7 * SPRINT_DAY_MS;

/** UTC+3 calendar day number since the epoch (any day is fine for arithmetic) */
function utc3DayNumber(nowMs: number): number {
  return Math.floor((nowMs + SPRINT_TZ_MS) / SPRINT_DAY_MS);
}

/** JS weekday (0=Sunday..6=Saturday) in the UTC+3 calendar */
function utc3Weekday(nowMs: number): number {
  return (utc3DayNumber(nowMs) + 4) % 7;
}

/**
 * Monday 00:00:00.000 UTC+3 of the week containing `nowMs`.
 * 1970-01-01 (day 0) was a Thursday; day `d` has weekday (d+4)%7, so a
 * Monday-start week index is floor((d+3)/7) — verified in the unit tests.
 */
export function sprintWeekStartMs(nowMs: number): number {
  const dayStart = utc3DayNumber(nowMs) * SPRINT_DAY_MS - SPRINT_TZ_MS;
  return dayStart - (utc3Weekday(nowMs) + 6) % 7 * SPRINT_DAY_MS;
}

/** Moment the sprint window closes: next Monday 00:00:00.000 UTC+3 */
export function sprintWeekEndsAtMs(nowMs: number): number {
  return sprintWeekStartMs(nowMs) + SPRINT_WEEK_MS;
}

/** ISO date (YYYY-MM-DD, UTC+3) of the week's Monday — the sprint identity */
export function sprintWeekKey(nowMs: number): string {
  // format in the sprint calendar: shift by TZ so toISOString shows the UTC+3 date
  return new Date(sprintWeekStartMs(nowMs) + SPRINT_TZ_MS).toISOString().slice(0, 10);
}

/** Monday-aligned week number since the epoch (theme rotation index) */
export function sprintWeekIndex(nowMs: number): number {
  return Math.floor((utc3DayNumber(nowMs) + 3) / 7);
}

/** Number of whole days left in the window (0 = last day) */
export function sprintDaysLeft(nowMs: number): number {
  return Math.floor((sprintWeekEndsAtMs(nowMs) - 1 - nowMs) / SPRINT_DAY_MS);
}

export interface SprintGoalDef {
  id: string;
  prefix: string;
  count: number;
  description: string;
}

export interface SprintThemeDef {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  goals: SprintGoalDef[];
  reward: { money?: number; motivation?: number; reputation?: number };
}

/** The theme active for the real week of `nowMs` (content list rotates weekly) */
export function activeSprintTheme(themes: SprintThemeDef[] | undefined, nowMs: number): SprintThemeDef | null {
  if (!themes || themes.length === 0) return null;
  const index = ((sprintWeekIndex(nowMs) % themes.length) + themes.length) % themes.length;
  return themes[index];
}

/**
 * Ensure the player's sprint record matches the current real week.
 * Returns a fresh record when there is none or the week rolled over; when the
 * player is mid-week already, returns the stored record untouched.
 */
export function rollSprint(
  stored: PlayerSprint | undefined,
  themes: SprintThemeDef[] | undefined,
  nowMs: number
): PlayerSprint | null {
  const theme = activeSprintTheme(themes, nowMs);
  if (!theme) return null;
  const week = sprintWeekKey(nowMs);
  if (stored && stored.week === week && stored.themeId === theme.id) return stored;
  return { week, themeId: theme.id, progress: {}, claimed: false };
}

export function sprintGoalDone(goal: SprintGoalDef, sprint: PlayerSprint): boolean {
  return (sprint.progress[goal.id] ?? 0) >= goal.count;
}

export function sprintAllDone(theme: SprintThemeDef, sprint: PlayerSprint): boolean {
  return theme.goals.every((g) => sprintGoalDone(g, sprint));
}

export interface SprintBump {
  sprint: PlayerSprint;
  /** true when this action completed the last remaining goal */
  doneJustNow: boolean;
}

/**
 * Count an action toward the current sprint (no-op when no sprint is active).
 * Progress is capped at each goal's count; it never ticks after the reward
 * has been claimed (progress is only a meter, the money is already banked).
 */
export function bumpSprintProgress(
  stored: PlayerSprint | undefined,
  themes: SprintThemeDef[] | undefined,
  actionId: string,
  nowMs: number
): SprintBump | null {
  const rolled = rollSprint(stored, themes, nowMs);
  if (!rolled) return null;
  const theme = activeSprintTheme(themes, nowMs)!;

  let changed = false;
  const progress = { ...rolled.progress };
  for (const goal of theme.goals) {
    const current = progress[goal.id] ?? 0;
    if (current >= goal.count || rolled.claimed) continue;
    if (!actionId.startsWith(goal.prefix)) continue;
    progress[goal.id] = current + 1;
    changed = true;
  }
  if (!changed) return { sprint: rolled, doneJustNow: false };

  const sprint: PlayerSprint = { ...rolled, progress };
  const doneJustNow = !sprintAllDone(theme, rolled) && sprintAllDone(theme, sprint);
  return { sprint, doneJustNow };
}

/** Grant the weekly reward (pure — the caller applies it to the state). */
export function sprintRewardAmounts(theme: SprintThemeDef): { money: number; motivation: number; reputation: number } {
  return {
    money: theme.reward?.money ?? 0,
    motivation: theme.reward?.motivation ?? 0,
    reputation: theme.reward?.reputation ?? 0,
  };
}
