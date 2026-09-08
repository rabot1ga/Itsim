import { PlayerState, MetaLife, Grade } from '../types';
import { createNewPlayer } from './player';
import { careerLevelIndex } from './economy';

/**
 * Meta layer — «Новая жизнь» prestige (roadmap P1.1).
 *
 * The game is currently a one-way climb to a career ending (CTO board,
 * burnout, «ушёл из IT», …). Prestige turns that dead end into a loop:
 * reach an ending → restart the career from day 1 with a permanent +15% XP
 * multiplier per completed life (capped at 5 lives), while the achievements,
 * the check-in streak, monetization entitlements and a lifetime ledger
 * («сколько жизней, какие финалы, лучший грейд, глубочайший день»)
 * survive. It is the long-term sink that makes the meta not feel empty.
 *
 * Everything here is pure: no Date, no storage — easy to unit test and to
 * reuse from the server route and the client UI.
 */

/** permanent XP bonus per completed life */
export const META_XP_PER_LIFE = 0.15;
/** after this many lives the XP bonus stops growing (grace, not infinity) */
export const META_XP_LIVES_CAP = 5;

/** «Новая жизнь» becomes available only after a career ending */
export function canStartNewLife(state: PlayerState): boolean {
  return Boolean(state.careerEnding);
}

/** Current permanent XP multiplier from the meta ledger (1 + lives × 15%, capped) */
export function metaXpMult(meta?: MetaLife): number {
  const lives = Math.min(meta?.lives ?? 0, META_XP_LIVES_CAP);
  return 1 + lives * META_XP_PER_LIFE;
}

/** Human-readable bonus, e.g. +15% — used by the server message and the UI */
export function metaXpBonusPct(meta?: MetaLife): number {
  return Math.round((metaXpMult(meta) - 1) * 100);
}

function betterGrade(a: Grade | undefined, b: Grade): Grade | undefined {
  if (!a) return b;
  return careerLevelIndex(a) >= careerLevelIndex(b) ? a : b;
}

/**
 * Build the state of the next life from the previous one.
 *
 * The career fully resets (fresh player, day 1, unemployed, empty skills —
 * the old run's rooms/items/relationships are part of *that* life). What
 * survives is the player's permanent identity:
 *   - meta ledger (lives + 1, the ending just seen appended to memories,
 *     best grade / deepest day / lifetime actions updated),
 *   - achievements,
 *   - Telegram Stars entitlements & badges (they were bought by the person,
 *     not by the character),
 *   - the real-world check-in streak (retention lives in real days, not in
 *     game days).
 */
export function buildNewLife(prev: PlayerState): PlayerState {
  const fresh = createNewPlayer();
  const prevMeta = prev.meta;
  const endings = [...(prevMeta?.memories ?? [])];
  if (prev.careerEnding && !endings.includes(prev.careerEnding)) endings.push(prev.careerEnding);

  const meta: MetaLife = {
    lives: (prevMeta?.lives ?? 0) + 1,
    memories: endings,
    bestGrade: betterGrade(prevMeta?.bestGrade, prev.grade),
    deepestDay: Math.max(prevMeta?.deepestDay ?? 0, prev.currentDay ?? 0),
    lifetimeActions: (prevMeta?.lifetimeActions ?? 0) + (prev.totalActions ?? 0),
  };

  fresh.meta = meta;
  fresh.achievements = [...(prev.achievements ?? [])];
  if (prev.entitlements?.length) fresh.entitlements = [...prev.entitlements];
  if (prev.badges?.length) fresh.badges = [...prev.badges];
  fresh.dailyStreak = prev.dailyStreak;
  fresh.lastCheckInDate = prev.lastCheckInDate;
  fresh.walletAddress = prev.walletAddress;
  // the weekly sprint belongs to the real-time week, not to the career —
  // starting a new life mid-week keeps the week's progress and its claim
  if (prev.sprint) fresh.sprint = { ...prev.sprint };
  return fresh;
}
