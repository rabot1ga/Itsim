import { describe, expect, it } from 'vitest';
import {
  bidChance,
  consolationPayment,
  projectBlockedReason,
  resolveBid,
  startProject,
  type ProjectDef,
} from '../../index';

/**
 * Bidding for a contract (see engine/projects.ts).
 *
 * The board used to hand out projects on tap, which made the freelance action
 * a second door to the same money. Now a bid is a gamble with three honest
 * levers — skill depth over the entry bar, reputation, and how much money is
 * on the table — resolved the next morning.
 */

const landing: ProjectDef = {
  id: 'landing',
  title: 'Сайт-визитка',
  subtitle: 'Одностраничник для кофейни',
  icon: 'screen',
  payment: 35_000,
  reputation: 1,
  minSkillLevel: 0,
  deadlineDays: 5,
  tasks: [{ id: 't1', title: 'Вёрстка', xp: 10, energy: 2 }],
} as ProjectDef;

const platform: ProjectDef = { ...landing, id: 'data_platform', payment: 400_000, minSkillLevel: 25 };

describe('freelance bids', () => {
  it('rewards depth over the entry bar and reputation, punishes stakes', () => {
    const green = bidChance(landing, { skillLevel: 0, reputation: 0 });
    const deep = bidChance(landing, { skillLevel: 20, reputation: 0 });
    const known = bidChance(landing, { skillLevel: 0, reputation: 100 });
    const rich = bidChance(platform, { skillLevel: 25, reputation: 0 });

    expect(deep).toBeGreaterThan(green);
    expect(known).toBeGreaterThan(green);
    expect(rich).toBeLessThan(bidChance({ ...platform, payment: 35_000 }, { skillLevel: 25, reputation: 0 }));
  });

  it('never promises a certainty and never gives up hope', () => {
    const best = bidChance(landing, { skillLevel: 100, reputation: 100 });
    const worst = bidChance(platform, { skillLevel: 25, reputation: 0 });
    expect(best).toBeLessThanOrEqual(0.9);
    expect(worst).toBeGreaterThanOrEqual(0.1);
  });

  it('splits one roll into signed / paid test task / silence', () => {
    expect(resolveBid(0.5, 0.0)).toBe('won');
    expect(resolveBid(0.5, 0.49)).toBe('won');
    expect(resolveBid(0.5, 0.51)).toBe('consolation');
    expect(resolveBid(0.5, 0.62)).toBe('consolation'); // 0.5 + 0.25 * 0.5 = 0.625
    expect(resolveBid(0.5, 0.63)).toBe('lost');
    // A certain bid is still resolved without dividing by zero.
    expect(resolveBid(1, 0.999)).toBe('won');
    expect(resolveBid(0, 0)).toBe('consolation');
  });

  it('pays something for the test task, never nothing', () => {
    expect(consolationPayment(landing)).toBe(2100);
    expect(consolationPayment({ ...landing, payment: 1000 })).toBe(500);
    expect(consolationPayment(platform)).toBeLessThan(platform.payment);
  });

  it('blocks a second bid while one is waiting for an answer', () => {
    const pendingBid = { projectId: 'landing', day: 3, chance: 0.4 };
    expect(projectBlockedReason(landing, { activeProject: null, skillLevel: 5, pendingBid })).toBe(
      'Отклик отправлен — ответ утром'
    );
    expect(projectBlockedReason(platform, { activeProject: null, skillLevel: 40, pendingBid })).toBe(
      'Уже ждёшь ответа по другому заказу'
    );
    expect(projectBlockedReason(landing, { activeProject: null, skillLevel: 5, pendingBid: null })).toBeNull();
    expect(
      projectBlockedReason(landing, {
        activeProject: startProject(landing, 2),
        skillLevel: 5,
        pendingBid: null,
      })
    ).toBe('Сначала закончи текущий проект');
  });
});
