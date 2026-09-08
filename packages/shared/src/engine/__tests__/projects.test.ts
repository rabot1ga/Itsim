import { describe, it, expect } from 'vitest';
import {
  LATE_PAYMENT_MULT,
  PlayerProject,
  ProjectDef,
  findProject,
  projectBlockedReason,
  projectComplete,
  projectDaysLeft,
  projectFailurePenalty,
  projectPayout,
  projectProgress,
  remainingTasks,
  startProject,
} from '../../index';

const def: ProjectDef = {
  id: 'telegram_bot',
  title: 'Telegram-бот',
  subtitle: 'Бот для доставки',
  icon: 'chat',
  payment: 60000,
  reputation: 2,
  deadlineDays: 6,
  minSkillLevel: 3,
  tasks: [
    { id: 'commands', title: 'Команды', xp: 12, energy: 3 },
    { id: 'auth', title: 'Авторизация', xp: 20, energy: 4 },
  ],
};

const taken = (tasksDone: string[] = [], day = 10): PlayerProject => ({
  id: def.id,
  startedDay: 4,
  deadlineDay: day,
  tasksDone,
});

describe('projects with deadlines', () => {
  it('starts on the current day and dates the deadline from the definition', () => {
    expect(startProject(def, 4)).toEqual({ id: 'telegram_bot', startedDay: 4, deadlineDay: 10, tasksDone: [] });
  });

  it('reports remaining tasks and progress from the content order', () => {
    expect(remainingTasks(def, taken(['commands'])).map((t) => t.id)).toEqual(['auth']);
    expect(projectProgress(def, taken(['commands']))).toBe(50);
    expect(projectComplete(def, taken(['commands', 'auth']))).toBe(true);
  });

  it('counts the deadline day itself as still on time', () => {
    expect(projectDaysLeft(taken(), 10)).toBe(0);
    expect(projectPayout(def, taken(), 10)).toEqual({ money: 60000, reputation: 2, late: false });
  });

  it('pays less and gives no reputation after the deadline', () => {
    const payout = projectPayout(def, taken(), 11);
    expect(payout).toEqual({ money: Math.round(60000 * LATE_PAYMENT_MULT), reputation: 0, late: true });
  });

  it('blocks a second project and an underqualified player, with a real reason', () => {
    expect(projectBlockedReason(def, { activeProject: null, skillLevel: 3 })).toBeNull();
    expect(projectBlockedReason(def, { activeProject: taken(), skillLevel: 30 })).toBe('Сначала закончи текущий проект');
    expect(projectBlockedReason(def, { activeProject: null, skillLevel: 2 })).toContain('уровень основного навыка 3');
  });

  it('always charges at least one reputation for a failure and finds by id', () => {
    expect(projectFailurePenalty(def)).toBe(1);
    expect(projectFailurePenalty({ ...def, reputation: 0 })).toBe(1);
    expect(projectFailurePenalty({ ...def, reputation: 6 })).toBe(3);
    expect(findProject([def], 'telegram_bot')).toBe(def);
    expect(findProject([def], 'nope')).toBeNull();
    expect(findProject(undefined, 'telegram_bot')).toBeNull();
  });
});
