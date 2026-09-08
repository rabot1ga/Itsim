import { FreelanceBid, PlayerProject, ProjectDef, ProjectTaskDef } from '../types';

/**
 * Freelance projects with deadlines (reference 1.png, «Работа»).
 *
 * A project is a small contract: several named tasks, one payment and a real
 * calendar deadline. It is not handed out on tap: the player answers the ad
 * (`freelance` action → `FreelanceBid`), sleeps on it, and in the morning the
 * client either signs them, pays for the test task, or picks someone else.
 *
 * Pure module: every function takes the state it needs and returns data, so
 * the server owns persistence and the client can preview the same numbers.
 */

export function findProject(projects: ProjectDef[] | undefined, id: string): ProjectDef | null {
  return (projects ?? []).find((p) => p.id === id) ?? null;
}

/** Tasks still to do, in content order — the UI list and the server agree. */
export function remainingTasks(def: ProjectDef, active: PlayerProject): ProjectTaskDef[] {
  return def.tasks.filter((task) => !active.tasksDone.includes(task.id));
}

export function projectProgress(def: ProjectDef, active: PlayerProject): number {
  if (def.tasks.length === 0) return 0;
  const done = def.tasks.filter((task) => active.tasksDone.includes(task.id)).length;
  return Math.round((done / def.tasks.length) * 100);
}

/** Whole days left before the deadline day passes. Negative = overdue. */
export function projectDaysLeft(active: PlayerProject, currentDay: number): number {
  return active.deadlineDay - currentDay;
}

export function projectComplete(def: ProjectDef, active: PlayerProject): boolean {
  return def.tasks.every((task) => active.tasksDone.includes(task.id));
}

/** Why the player cannot bid for this project right now, or null when they can. */
export function projectBlockedReason(
  def: ProjectDef,
  opts: {
    activeProject: PlayerProject | null | undefined;
    skillLevel: number;
    pendingBid?: FreelanceBid | null;
  }
): string | null {
  if (opts.activeProject) return 'Сначала закончи текущий проект';
  if (opts.pendingBid) {
    return opts.pendingBid.projectId === def.id
      ? 'Отклик отправлен — ответ утром'
      : 'Уже ждёшь ответа по другому заказу';
  }
  if (opts.skillLevel < def.minSkillLevel) {
    return `Нужен уровень основного навыка ${def.minSkillLevel} (сейчас ${opts.skillLevel})`;
  }
  return null;
}

/**
 * Chance the client signs this player, fixed at the moment of the bid.
 *
 * Three honest levers: how far above the entry bar the main skill is, the
 * reputation the player has actually earned, and how much money is on the
 * table — a 400 000 ₽ contract has a queue behind it.
 */
export function bidChance(def: ProjectDef, opts: { skillLevel: number; reputation: number }): number {
  const depth = clampUnit((opts.skillLevel - def.minSkillLevel) / 20);
  const rep = clampUnit(opts.reputation / 100);
  const stakes = clampUnit(def.payment / 400_000);
  const chance = 0.3 + 0.4 * depth + 0.2 * rep - 0.2 * stakes;
  return Math.round(clamp(chance, 0.1, 0.9) * 100) / 100;
}

/** A quarter of the losses still pay for the test task — the night is not wasted. */
export const CONSOLATION_SHARE = 0.25;

/** What a paid test task is worth: symbolic money, real for a junior. */
export function consolationPayment(def: ProjectDef): number {
  return Math.max(500, Math.round((def.payment * 0.06) / 100) * 100);
}

export type BidOutcome = 'won' | 'consolation' | 'lost';

/** Resolve a bid against one roll in [0, 1) — the caller owns the RNG. */
export function resolveBid(chance: number, roll: number): BidOutcome {
  const win = clamp(chance, 0, 1);
  if (roll < win) return 'won';
  if (roll < win + (1 - win) * CONSOLATION_SHARE) return 'consolation';
  return 'lost';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

export function startProject(def: ProjectDef, currentDay: number): PlayerProject {
  return { id: def.id, startedDay: currentDay, deadlineDay: currentDay + def.deadlineDays, tasksDone: [] };
}

/** Late delivery is still delivery, but the client pays less and grumbles. */
export const LATE_PAYMENT_MULT = 0.6;

export function projectPayout(
  def: ProjectDef,
  active: PlayerProject,
  currentDay: number
): { money: number; reputation: number; late: boolean } {
  const late = projectDaysLeft(active, currentDay) < 0;
  return {
    money: late ? Math.round(def.payment * LATE_PAYMENT_MULT) : def.payment,
    reputation: late ? 0 : def.reputation,
    late,
  };
}

/** Reputation lost when a deadline passes with the project unfinished. */
export function projectFailurePenalty(def: ProjectDef): number {
  return Math.max(1, Math.round(def.reputation / 2));
}
