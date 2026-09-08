import { describe, expect, it } from 'vitest';
import {
  applyCheckIn,
  checkInReward,
  gameDate,
  isCheckInDue,
  nextStreak,
  previousGameDate,
  CHECK_IN_REWARD_BASE,
} from '../checkIn';

/** fixed instant: 2026-09-08 10:00 UTC = 13:00 in game-day tz (UTC+3) */
const NOW = Date.UTC(2026, 8, 8, 10, 0, 0);
const TODAY = gameDate(NOW);
const YESTERDAY = previousGameDate(NOW);
const TWO_DAYS_AGO = previousGameDate(NOW - 24 * 3600 * 1000);

describe('game date helpers', () => {
  it('formats YYYY-MM-DD in UTC+3 and shifts the day at 21:00 UTC', () => {
    expect(gameDate(NOW)).toBe('2026-09-08');
    // 22:00 UTC = 01:00 next day in UTC+3
    expect(gameDate(Date.UTC(2026, 8, 8, 22, 0, 0))).toBe('2026-09-09');
  });

  it('previousGameDate is one day back', () => {
    expect(YESTERDAY).toBe('2026-09-07');
    expect(TWO_DAYS_AGO).toBe('2026-09-06');
  });
});

describe('daily check-in streak', () => {
  it('new player is due and starts a streak of 1', () => {
    expect(isCheckInDue(undefined, NOW)).toBe(true);
    expect(nextStreak({}, NOW)).toBe(1);
    const r = applyCheckIn({}, NOW);
    expect(r).toMatchObject({ streak: 1, claimed: true });
    expect(r.reward.money).toBe(CHECK_IN_REWARD_BASE);
  });

  it('checking in again the same day is not due and keeps the streak', () => {
    expect(isCheckInDue(TODAY, NOW)).toBe(false);
    expect(nextStreak({ lastCheckInDate: TODAY, dailyStreak: 3 }, NOW)).toBe(3);
    expect(applyCheckIn({ lastCheckInDate: TODAY, dailyStreak: 3 }, NOW).claimed).toBe(false);
  });

  it('consecutive day grows the streak', () => {
    expect(nextStreak({ lastCheckInDate: YESTERDAY, dailyStreak: 2 }, NOW)).toBe(3);
    const r = applyCheckIn({ lastCheckInDate: YESTERDAY, dailyStreak: 2 }, NOW);
    expect(r.streak).toBe(3);
    expect(r.claimed).toBe(true);
  });

  it('a missed day resets the streak to 1', () => {
    expect(nextStreak({ lastCheckInDate: TWO_DAYS_AGO, dailyStreak: 5 }, NOW)).toBe(1);
  });

  it('reward grows with streak and plateaus at the cap', () => {
    expect(checkInReward(1).money).toBe(300);
    expect(checkInReward(4).money).toBe(600);
    expect(checkInReward(7).money).toBe(900);
    expect(checkInReward(20).money).toBe(900); // plateau, still capped
  });
});
