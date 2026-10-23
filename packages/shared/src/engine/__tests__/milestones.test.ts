import { describe, it, expect } from 'vitest';
import { dayWord, gradeWord, recordMilestones, MAX_MILESTONES } from '../milestones';
import type { PlayerState } from '../../types';

/**
 * Автопостинг вех: детект фактов по состоянию, идемпотентность по id,
 * пост — в мутации, где факт стал верным («за N дней» = N-й день пути).
 */

function state(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    version: 6,
    currentDay: 1,
    grade: 'unemployed',
    money: 0,
    health: 80,
    motivation: 50,
    energy: 10,
    maxEnergy: 10,
    reputation: 0,
    bankedDays: 0,
    skills: {},
    perks: [],
    softSkills: {},
    job: null,
    ...overrides,
  } as PlayerState;
}

describe('dayWord: русские формы «день»', () => {
  it('1/2/5 и исключения 11–14', () => {
    expect(dayWord(1)).toBe('день');
    expect(dayWord(21)).toBe('день');
    expect(dayWord(2)).toBe('дня');
    expect(dayWord(22)).toBe('дня');
    expect(dayWord(5)).toBe('дней');
    expect(dayWord(11)).toBe('дней');
    expect(dayWord(12)).toBe('дней');
    expect(dayWord(14)).toBe('дней');
    expect(dayWord(0)).toBe('дней');
  });
});

describe('gradeWord: ключи словаря для подписи', () => {
  it('грейды разложены по словарным ключам, неизвестный проходит как есть', () => {
    expect(gradeWord('senior')).toBe('сеньор');
    expect(gradeWord('cto')).toBe('CTO');
    expect(gradeWord('wizard')).toBe('wizard');
  });
});

describe('recordMilestones', () => {
  it('безработный не постится; повышение — один пост с верной подписью', () => {
    const s = state({ currentDay: 1 });
    expect(recordMilestones(s)).toEqual([]); // unemployed — не веха
    s.grade = 'junior';
    s.currentDay = 10;
    const fresh = recordMilestones(s);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe('grade:junior');
    expect(fresh[0].key).toBe('Стал {p0} за {p1} {p2}!');
    expect(fresh[0].params).toEqual({ p0: 'джун', p1: 10, p2: 'дней' });
    // повторный вызов — идемпотентно
    expect(recordMilestones(s)).toEqual([]);
    expect(s.milestones).toHaveLength(1);
  });

  it('форма слова для малых чисел: «за 2 дня»', () => {
    const s = state({ grade: 'intern', currentDay: 2 });
    const fresh = recordMilestones(s);
    expect(fresh[0].params?.p2).toBe('дня');
  });

  it('прыжок через ступени постит только целевой грейд', () => {
    const s = state({ grade: 'architect', currentDay: 78 });
    const fresh = recordMilestones(s);
    expect(fresh.map((m) => m.id)).toEqual(['grade:architect']);
  });

  it('миллион, год и финал — отдельные вехи с подписями', () => {
    const s = state({ grade: 'senior', currentDay: 365, money: 1_200_000, careerEnding: 'exit' });
    const fresh = recordMilestones(s, { endings: { exit: { title: 'Экзит' } } });
    expect(fresh.map((m) => m.id)).toEqual(['grade:senior', 'million', 'year', 'ending:exit']);
    const ending = fresh.find((m) => m.id === 'ending:exit');
    expect(ending?.key).toBe('Финал: {p0}');
    expect(ending?.params).toEqual({ p0: 'Экзит' });
    // идемпотентность: повторно — пусто
    expect(recordMilestones(s, { endings: { exit: { title: 'Экзит' } } })).toEqual([]);
  });

  it('лента ограничена MAX_MILESTONES, старые вытесняются', () => {
    const s = state({ grade: 'unemployed', currentDay: 1 });
    s.milestones = Array.from({ length: MAX_MILESTONES }, (_, i) => ({
      id: `fake:${MAX_MILESTONES - i}`,
      day: i,
      key: 'Финал: {p0}',
    }));
    s.grade = 'junior';
    s.currentDay = 2;
    recordMilestones(s);
    expect(s.milestones).toHaveLength(MAX_MILESTONES);
    expect(s.milestones?.[0].id).toBe('grade:junior');
    // fake:1 — самый старый (конец списка newest-first) и вытеснен
    expect(s.milestones?.map((m) => m.id)).not.toContain('fake:1');
    expect(s.milestones?.[s.milestones.length - 1].id).toBe('fake:2');
  });
});
