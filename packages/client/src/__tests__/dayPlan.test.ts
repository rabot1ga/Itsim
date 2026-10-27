import { describe, expect, it } from 'vitest';
import { challengeDelegate, pickDayPlan } from '../screens/dayPlan';

/** Базовый игрок: есть работа, энергия полная, денег хватает. */
const player = (over: Record<string, unknown> = {}) => ({
  energy: 10,
  money: 50_000,
  motivation: 60,
  job: { position: 'Junior', salary: 90_000 },
  dailyChallenge: null,
  ...over,
});

describe('pickDayPlan (B: план дня)', () => {
  it('даёт карьеру, учёбу и людей при полной энергии', () => {
    const plan = pickDayPlan(player());
    expect(plan.map((a) => a.id)).toEqual(['work_task', 'study_course', 'networking']);
  });

  it('без работы вместо рабочей задачи — пет-проект', () => {
    const plan = pickDayPlan(player({ job: null }));
    expect(plan[0].id).toBe('pet_project');
  });

  it('низкая энергия — только восстановление', () => {
    const plan = pickDayPlan(player({ energy: 2 }));
    expect(plan.map((a) => a.id)).toEqual(['rest_sleep', 'rest_walk']);
  });

  it('учёба дешевеет вместе с кошельком', () => {
    expect(pickDayPlan(player({ money: 15_000 }))[1].id).toBe('study_course');
    expect(pickDayPlan(player({ money: 5_000 }))[1].id).toBe('study_stepik');
    expect(pickDayPlan(player({ money: 1_600 }))[1].id).toBe('study_book');
    expect(pickDayPlan(player({ money: 500 }))[1].id).toBe('study_youtube');
  });

  it('низкое настроение при деньгах — бар вместо нетворкинга', () => {
    const plan = pickDayPlan(player({ motivation: 20, money: 3_000 }));
    expect(plan[2].id).toBe('rest_bar');
  });

  it('незакрытый челлендж становится первым действием плана', () => {
    const plan = pickDayPlan(
      player({ dailyChallenge: { id: 'ch_walk_2', action: 'rest_walk', match: 'exact', done: false } })
    );
    expect(plan[0].id).toBe('rest_walk');
  });

  it('без дублей, максимум 4 плитки', () => {
    const plan = pickDayPlan(
      player({ dailyChallenge: { id: 'ch_work_3', action: 'work_task', match: 'exact', done: false } })
    );
    expect(plan.filter((a) => a.id === 'work_task')).toHaveLength(1);
    expect(plan.length).toBeLessThanOrEqual(4);
  });
});

describe('challengeDelegate (клик по заданию дня)', () => {
  it('простые действия запускаются напрямую', () => {
    const d = challengeDelegate({ action: 'networking', match: 'exact' });
    expect(d).toEqual(expect.objectContaining({ kind: 'action' }));
    if (d?.kind === 'action') expect(d.action.id).toBe('networking');
  });

  it('study_ выбирает учёбу по кошельку', () => {
    const rich = challengeDelegate({ action: 'study_', match: 'prefix' }, 2_000);
    const poor = challengeDelegate({ action: 'study_', match: 'prefix' }, 0);
    if (rich?.kind === 'action') expect(rich.action.id).toBe('study_book');
    if (poor?.kind === 'action') expect(poor.action.id).toBe('study_youtube');
  });

  it('покупка и кормление ведут на экран, а не действие', () => {
    expect(challengeDelegate({ action: 'buy_item', match: 'exact' })).toEqual(
      expect.objectContaining({ kind: 'view', view: 'shop' })
    );
    expect(challengeDelegate({ action: 'feed_pet', match: 'exact' })).toEqual(
      expect.objectContaining({ kind: 'view', view: 'pet' })
    );
    expect(challengeDelegate({ action: 'freelance', match: 'exact' })).toEqual(
      expect.objectContaining({ kind: 'view', view: 'career' })
    );
  });

  it('неизвестное действие не даёт делегата', () => {
    expect(challengeDelegate({ action: 'nope', match: 'exact' })).toBeNull();
    expect(challengeDelegate(null)).toBeNull();
  });
});
