/**
 * Tiny internal helper re-exports so `actions.ts` and `day.ts` share the
 * daily-challenge code without depending on the bigger day file.
 */
import { seededRng } from '@itsim/shared';
import { clamp, activeSprintTheme, rollSprint, sprintWeekEndsAtMs, sprintDaysLeft } from '@itsim/shared';
import { StoredState } from './shared.js';

/**
 * Deterministic daily challenge for a player + day
 */
export function resetDailyChallenge(state: StoredState, content: any): void {
  const list = content.challenges as any[];
  if (!list || list.length === 0) return;
  const rng = seededRng(`${state.telegramId}:challenge:${state.currentDay}`);
  const def = list[Math.floor(rng() * list.length)];
  state.dailyChallenge = { day: state.currentDay, id: def.id, progress: 0, count: def.count, done: false };
}

/**
 * Bump challenge progress after a successful action; returns a message
 * when the challenge completes (rewards are granted here).
 */
export function bumpChallenge(state: StoredState, content: any, actionId: string): string | null {
  const ch = state.dailyChallenge;
  if (!ch || ch.done) return null;
  const def = (content.challenges as any[]).find((c) => c.id === ch.id);
  if (!def) return null;
  const hit = def.match === 'prefix' ? actionId.startsWith(def.action) : actionId === def.action;
  if (!hit) return null;

  ch.progress = Math.min(ch.count, ch.progress + 1);
  if (ch.progress < ch.count) return null;

  ch.done = true;
  const reward = def.reward ?? {};
  if (reward.money) state.money += reward.money;
  if (reward.motivation) state.motivation = clamp(state.motivation + reward.motivation, 0, 100);
  if (reward.reputation) state.reputation = clamp(state.reputation + reward.reputation, 0, 100);

  const parts: string[] = [];
  if (reward.money) parts.push(`+${reward.money} ₽`);
  if (reward.motivation) parts.push(`+${reward.motivation} 🔥`);
  if (reward.reputation) parts.push(`+${reward.reputation} ⭐`);
  return `🎯 Задание дня выполнено: ${parts.join(', ')}`;
}

/**
 * Resolved, client-ready sprint view — what the banner in «День» renders.
 * Extracted from game.ts in P1.14 so `state.ts` and `sprint.ts` can share it.
 */
export function sprintView(state: StoredState, content: any, nowMs: number): any | null {
  const theme = activeSprintTheme(content.sprints?.themes, nowMs);
  if (!theme) return null;
  const sprint = rollSprint(state.sprint, content.sprints?.themes, nowMs);
  if (!sprint) return null;
  const goals = theme.goals.map((g: any) => ({
    id: g.id,
    description: g.description,
    count: g.count,
    progress: Math.min(sprint.progress[g.id] ?? 0, g.count),
    done: (sprint.progress[g.id] ?? 0) >= g.count,
  }));
  const reward = theme.reward ?? {};
  return {
    week: sprint.week,
    themeId: theme.id,
    title: theme.title,
    subtitle: theme.subtitle ?? '',
    icon: theme.icon,
    goals,
    allDone: goals.every((g: any) => g.done),
    claimed: sprint.claimed,
    reward: {
      money: reward.money ?? 0,
      motivation: reward.motivation ?? 0,
      reputation: reward.reputation ?? 0,
    },
    endsAtMs: sprintWeekEndsAtMs(nowMs),
    daysLeft: Math.max(0, sprintDaysLeft(nowMs)),
  };
}
