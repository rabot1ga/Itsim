import { PlayerProject, ProjectDef, ProjectTaskDef } from '../types';

/**
 * Freelance projects with deadlines (reference 1.png, «Работа»).
 *
 * A project is a small contract: several named tasks, one payment and a real
 * calendar deadline. It differs from the single-tap `freelance` action on
 * purpose — that one is instant pocket money, while a project asks the player
 * to spend energy across several game days and punishes a missed deadline.
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

/** Why the player cannot take this project right now, or null when they can. */
export function projectBlockedReason(
  def: ProjectDef,
  opts: { activeProject: PlayerProject | null | undefined; skillLevel: number }
): string | null {
  if (opts.activeProject) return 'Сначала закончи текущий проект';
  if (opts.skillLevel < def.minSkillLevel) {
    return `Нужен уровень основного навыка ${def.minSkillLevel} (сейчас ${opts.skillLevel})`;
  }
  return null;
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
