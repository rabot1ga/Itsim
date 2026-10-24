import { describe, it, expect } from 'vitest';
import { clampStateAnomalies, detectDeltaAnomalies } from '../anomaly';

/**
 * Детекция аномалий: жёсткие инварианты выравниваются (clamp), подозрительные
 * скачки между сохранениями — сигнал без наказания.
 */

describe('clampStateAnomalies', () => {
  it('выравнивает энергию/статы/день/скиллы в границах', () => {
    const state = {
      energy: 999,
      maxEnergy: 10,
      health: -5,
      motivation: 150,
      currentDay: 0,
      skills: { javascript: { level: 250, xp: -3 } },
    };
    const anomalies = clampStateAnomalies(state);
    expect(anomalies.map((a) => a.code).sort()).toEqual([
      'day_regression',
      'energy_out_of_range',
      'skills_out_of_range',
      'skills_out_of_range',
      'stats_out_of_range',
      'stats_out_of_range',
    ]);
    expect(state.energy).toBe(10);
    expect(state.health).toBe(0);
    expect(state.motivation).toBe(100);
    expect(state.currentDay).toBe(1);
    expect(state.skills.javascript).toEqual({ level: 100, xp: 0 });
  });

  it('состояние в норме — пусто и без изменений', () => {
    const state = {
      energy: 5,
      maxEnergy: 10,
      health: 80,
      motivation: 50,
      currentDay: 42,
      skills: { javascript: { level: 20, xp: 5 } },
    };
    expect(clampStateAnomalies(state)).toEqual([]);
  });

  it('NaN и maxEnergy-мусор тоже чинятся', () => {
    const state = { energy: Number.NaN, maxEnergy: -4 };
    const anomalies = clampStateAnomalies(state);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(state.maxEnergy).toBe(1);
    expect(state.energy).toBe(0);
  });
});

describe('detectDeltaAnomalies', () => {
  it('первое сохранение и честные дельты — пусто', () => {
    expect(detectDeltaAnomalies(undefined, { currentDay: 10 })).toEqual([]);
    const prev = { currentDay: 10, money: 1000, skills: { javascript: { level: 5, xp: 0 } } };
    const next = { currentDay: 11, money: 50_000, skills: { javascript: { level: 5, xp: 20 } } };
    expect(detectDeltaAnomalies(prev, next)).toEqual([]);
  });

  it('прыжок дня, денег и XP — сигналы', () => {
    const prev = { currentDay: 10, money: 0, skills: {} };
    const next = {
      currentDay: 500,
      money: 5_000_000_000,
      skills: { javascript: { level: 90, xp: 0 } },
    };
    const codes = detectDeltaAnomalies(prev, next).map((a) => a.code);
    expect(codes).toContain('day_jump');
    expect(codes).toContain('money_jump');
    expect(codes).toContain('xp_jump');
  });
});
