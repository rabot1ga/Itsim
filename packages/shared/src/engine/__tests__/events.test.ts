import { describe, it, expect } from 'vitest';
import { eventNeedsJob, pickEvent } from '../events';
import type { PlayerState, GameEvent } from '../../types';

/**
 * «Работа без работы» (25.10.2026): события с рабочими тегами
 * (work/office/sprint/project) не достаются безработному, если событие
 * явно не помечено `allowWithoutJob` (внешние предложения, импостор).
 */

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    version: 2,
    currentDay: 20,
    grade: 'unemployed',
    money: 10000,
    health: 80,
    motivation: 80,
    energy: 10,
    maxEnergy: 10,
    reputation: 0,
    bankedDays: 0,
    skills: {},
    perks: [],
    softSkills: {},
    job: null,
    jobWarnings: 0,
    pendingOffers: [],
    currentApplication: null,
    housingLevel: 0,
    items: [],
    pendingEvents: [],
    eventHistory: {},
    recentEventTags: [],
    relationships: {},
    activeFreelance: null,
    achievements: [],
    totalActions: 0,
    daysSinceRegistration: 20,
    lastMotivationDrift: 0,
    burnoutDays: 0,
    brokeDays: 0,
    leadership: 0,
    ...overrides,
  } as PlayerState;
}

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: 'test_event',
    title: 'Событие',
    description: 'Описание события для теста',
    tags: ['work'],
    weight: 1,
    cooldownDays: 0,
    minGameDay: 0,
    choices: [
      { text: 'А', effects: {} },
      { text: 'Б', effects: {} },
    ],
    ...overrides,
  } as GameEvent;
}

const JOB = { company: 'X', position: 'Junior', salary: 10000, grade: 'junior' } as any;

describe('eventNeedsJob', () => {
  it('рабочие теги требуют работы; allowWithoutJob — исключение', () => {
    expect(eventNeedsJob(event({ tags: ['work'] }))).toBe(true);
    expect(eventNeedsJob(event({ tags: ['office', 'crisis'] }))).toBe(true);
    expect(eventNeedsJob(event({ tags: ['sprint'] }))).toBe(true);
    expect(eventNeedsJob(event({ tags: ['project'] }))).toBe(true);
    expect(eventNeedsJob(event({ tags: ['work'], allowWithoutJob: true }))).toBe(false);
    expect(eventNeedsJob(event({ tags: ['career', 'social'] }))).toBe(false);
    expect(eventNeedsJob(event({ tags: ['health'] }))).toBe(false);
  });
});

describe('pickEvent: безработному не достаются рабочие события', () => {
  const rng = () => 0.99; // weightedPick возьмёт единственный доступный элемент

  it('без работы пул из одного work-события пуст', () => {
    const p = player({ job: null });
    expect(pickEvent(p, [event()], rng)).toBeNull();
  });

  it('с работой то же событие доступно', () => {
    const p = player({ job: JOB });
    expect(pickEvent(p, [event()], rng)?.id).toBe('test_event');
  });

  it('allowWithoutJob пропускает событие и без работы', () => {
    const p = player({ job: null });
    expect(pickEvent(p, [event({ allowWithoutJob: true })], rng)?.id).toBe('test_event');
  });

  it('внешние события (без рабочих тегов) достаются безработному', () => {
    const p = player({ job: null });
    expect(pickEvent(p, [event({ tags: ['career', 'reward'] })], rng)?.id).toBe('test_event');
  });

  it('рабочая цепочка (pending) без работы ждёт и уступает обычному событию', () => {
    const p = player({
      job: null,
      pendingEvents: [{ eventId: 'test_event', triggerDay: 10, chance: 1 }],
    });
    const everyday = event({ id: 'everyday', tags: ['life'] });
    expect(pickEvent(p, [event(), everyday], rng)?.id).toBe('everyday');
  });

  it('условия hasJob из контента работают и напрямую', () => {
    const p = player({ job: null });
    const gated = event({ conditions: { hasJob: true }, tags: ['life'] });
    expect(pickEvent(p, [gated], rng)).toBeNull();
  });
});
