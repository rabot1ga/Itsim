/**
 * Daily check-in streak (retention hook).
 *
 * The game day is a fiction the player advances by pressing «Завершить день»;
 * the STREAK is real-time: one check-in per calendar day, streak survives only
 * consecutive days. The "game date" boundary is fixed to UTC+3 so the streak
 * does not silently roll at 3 a.m. for European players no matter where the
 * server runs.
 *
 * Pure module: given the stored last check-in date and now, it answers who is
 * eligible and what the reward is — the server applies it to the state.
 */

/** game-day timezone: UTC+3 (Moscow) — constant, server-TZ independent */
export const GAME_TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

export const CHECK_IN_REWARD_BASE = 300;
export const CHECK_IN_REWARD_STEP = 100;
export const CHECK_IN_REWARD_CAP = 900;
/** after this streak the reward plateaus (still worth showing up) */
export const CHECK_IN_STREAK_CAP = 7;

/** YYYY-MM-DD in the game-day timezone for a unix timestamp */
export function gameDate(now: number): string {
  return new Date(now + GAME_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD one game-day before `now` */
export function previousGameDate(now: number): string {
  return gameDate(now - 24 * 60 * 60 * 1000);
}

export interface CheckInState {
  /** last day the player checked in (YYYY-MM-DD), if ever */
  lastCheckInDate?: string;
  /** streak as of that check-in */
  dailyStreak?: number;
}

/**
 * Whether the player may check in right now (once per game-day).
 */
export function isCheckInDue(lastCheckInDate: string | undefined, now: number): boolean {
  return !lastCheckInDate || lastCheckInDate !== gameDate(now);
}

/**
 * Streak that a check-in performed now would produce.
 *   · never checked in          → 1
 *   · checked in today already  → keep current streak (nothing to claim)
 *   · checked in yesterday      → streak + 1
 *   · checked in earlier        → streak resets to 1
 */
export function nextStreak(prev: CheckInState, now: number): number {
  const today = gameDate(now);
  if (!prev.lastCheckInDate) return 1;
  if (prev.lastCheckInDate === today) return Math.max(1, prev.dailyStreak ?? 1);
  if (prev.lastCheckInDate === previousGameDate(now)) return (prev.dailyStreak ?? 0) + 1;
  return 1;
}

export interface CheckInReward {
  money: number;
}

/** Money granted for a check-in with the given (post-claim) streak. */
export function checkInReward(streak: number): CheckInReward {
  const s = Math.min(Math.max(1, streak), CHECK_IN_STREAK_CAP);
  return { money: Math.min(CHECK_IN_REWARD_BASE + (s - 1) * CHECK_IN_REWARD_STEP, CHECK_IN_REWARD_CAP) };
}

/** Convenience: everything the server needs to apply one check-in. */
export function applyCheckIn(
  prev: CheckInState,
  now: number
): { streak: number; reward: CheckInReward; claimed: boolean } {
  if (!isCheckInDue(prev.lastCheckInDate, now)) {
    return { streak: Math.max(1, prev.dailyStreak ?? 1), reward: { money: 0 }, claimed: false };
  }
  const streak = nextStreak(prev, now);
  return { streak, reward: checkInReward(streak), claimed: true };
}
