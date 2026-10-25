import { describe, it, expect } from 'vitest';
import {
  absorbJobWarning,
  mentorXpDue,
  relationEffectLabelKey,
  spentTimeToday,
  markSpentTime,
  teamleadCovers,
  teamleadSurplusBonus,
  toxicConflictActive,
  clampRelation,
} from '../relationships';
import type { PlayerState } from '../../types';

/**
 * D1 «Отношения работают» (25.10.2026): три порога дают пассивные эффекты,
 * иначе relationships копятся в никуда (93 выбора меняют, 0 систем читают).
 */

function rel(relationships: Record<string, number>, extra: Partial<PlayerState> = {}): PlayerState {
  return { currentDay: 12, relationships, ...extra } as PlayerState;
}

describe('порог отношений: тимлид ≥ 60', () => {
  it('заступается только при 60+: бонус к surplus и гашение предупреждения', () => {
    expect(teamleadCovers(rel({ teamlead: 59 }))).toBe(false);
    expect(teamleadCovers(rel({ teamlead: 60 }))).toBe(true);
    expect(teamleadSurplusBonus(rel({ teamlead: 60 }))).toBe(2);
    expect(teamleadSurplusBonus(rel({ teamlead: 10 }))).toBe(0);
    expect(absorbJobWarning(rel({ teamlead: 60 }), 2)).toBe(1);
    expect(absorbJobWarning(rel({ teamlead: 60 }), 1)).toBe(0);
    expect(absorbJobWarning(rel({ teamlead: 10 }), 2)).toBe(2);
  });
});

describe('порог Маша ≥ 40: менторский XP раз в 3 дня', () => {
  it('срабатывает по каденсу, только при пороге', () => {
    expect(mentorXpDue(rel({ junior_colleague: 40 }, { currentDay: 12 }))).toBe(true); // 12 % 3 === 0
    expect(mentorXpDue(rel({ junior_colleague: 40 }, { currentDay: 13 }))).toBe(false);
    expect(mentorXpDue(rel({ junior_colleague: 39 }, { currentDay: 12 }))).toBe(false);
  });
});

describe('порог токсик ≤ −30: стресс-штраф', () => {
  it('конфликт активен только при −30 и ниже', () => {
    expect(toxicConflictActive(rel({ toxic_senior: -30 }))).toBe(true);
    expect(toxicConflictActive(rel({ toxic_senior: -29 }))).toBe(false);
    expect(toxicConflictActive(rel({}))).toBe(false);
  });
});

describe('действие «Провести время с другом»', () => {
  it('отмечает NPC на текущий день, повтор в тот же день закрыт', () => {
    const state = rel({ uni_friend: 10 }, { currentDay: 12 });
    expect(spentTimeToday(state, 'uni_friend')).toBe(false);
    markSpentTime(state, 'uni_friend');
    expect(spentTimeToday(state, 'uni_friend')).toBe(true);
    expect(spentTimeToday(state, 'teamlead')).toBe(false);
    (state as { currentDay?: number }).currentDay = 13;
    expect(spentTimeToday(state, 'uni_friend')).toBe(false);
  });
});

describe('чип-эффект (D1.4)', () => {
  it('показывает эффект порога для NPC с пассивными бонусами и пусто для прочих', () => {
    expect(relationEffectLabelKey('teamlead', 60)).toContain('заступается');
    expect(relationEffectLabelKey('teamlead', 10)).toContain('друг');
    expect(relationEffectLabelKey('junior_colleague', 40)).toContain('наставник');
    expect(relationEffectLabelKey('toxic_senior', -30)).toContain('конфликт');
    expect(relationEffectLabelKey('uni_friend', 80)).toBe('');
    expect(relationEffectLabelKey('hr_anna', 80)).toBe('');
  });
});

describe('кламп отношения', () => {
  it('держит −100..100', () => {
    expect(clampRelation(150)).toBe(100);
    expect(clampRelation(-150)).toBe(-100);
    expect(clampRelation(7)).toBe(7);
  });
});
