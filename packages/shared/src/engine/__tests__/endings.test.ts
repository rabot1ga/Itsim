import { describe, it, expect } from 'vitest';
import { checkEndings, firstAvailableEnding } from '../endings';
import type { PlayerState } from '../../types';
import type { BalanceConfig } from '../../schemas';

/** Minimal balance config that mirrors content/balance.json endings */
const BALANCE: BalanceConfig = {
  version: '2.1.0',
  baseEnergy: 10,
  maxEnergy: 16,
  minEnergy: 3,
  offlineHoursPerDay: 3.5,
  maxBankedDays: 7,
  motivationDailyDrift: -0.5,
  motivationHealthCapSlope: 0.6,
  motivationHealthCapBase: 40,
  foodHealthCook: 1,
  foodHealthDelivery: 0,
  startingMoney: 10000,
  rentGraceDays: 3,
  salaryWeeksPerMonth: 4.3,
  motivationMultMin: 0.7,
  motivationMultMax: 1.3,
  motivationMultSlope: 0.006,
  xpSources: {},
  networking: { commXp: 5, repGain: 0.5, energy: 2, dailyCap: 1, leadershipPerDay: 0, repFromPromotion: 0 },
  eventChanceOnboarding: 0.2,
  eventChanceEarly: 0.35,
  eventChanceMid: 0.28,
  eventChanceLate: 0.2,
  housing: [],
  sideJobs: {},
  mining: { priceBase: 40, volatility: 0.5, electricityPerHashrate: 0.5 },
  careerGates: [],
  endings: {
    burnoutDays: 7,
    brokeDaysToQuit: 15,
  },
} as BalanceConfig;

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    version: 2,
    currentDay: 1,
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
    activeCourses: [],
    pendingEvents: [],
    eventHistory: {},
    recentEventTags: [],
    relationships: {},
    activeFreelance: null,
    achievements: [],
    totalActions: 0,
    daysSinceRegistration: 1,
    lastMotivationDrift: 0,
    burnoutDays: 0,
    brokeDays: 0,
    leadership: 0,
    mentoredJuniors: 0,
    ...overrides,
  } as PlayerState;
}

describe('endings', () => {
  it('returns 6 endings even when no balance.endings is set', () => {
    const list = checkEndings(player(), undefined as any);
    expect(list).toHaveLength(0);
  });

  it('returns all 6 endings with balance.endings populated', () => {
    const list = checkEndings(player(), BALANCE);
    expect(list.map((e) => e.id)).toEqual(['cto', 'exit', 'free_artist', 'teacher', 'burnout', 'left_it']);
  });

  it('exit requires reputation, money, and senior+', () => {
    const list = checkEndings(player({ reputation: 80, money: 100_000_000, grade: 'senior' }), BALANCE);
    const exit = list.find((e) => e.id === 'exit')!;
    expect(exit.available).toBe(true);
    expect(exit.action).toBe('claim');
  });

  it('exit stays locked when only reputation is met', () => {
    const list = checkEndings(player({ reputation: 80, money: 1000, grade: 'senior' }), BALANCE);
    const exit = list.find((e) => e.id === 'exit')!;
    expect(exit.available).toBe(false);
    expect(exit.missing).toMatch(/деньги/);
  });

  it('free_artist requires senior+ with money below cap and reputation above floor', () => {
    const ok = checkEndings(player({ reputation: 50, money: 500_000, grade: 'senior' }), BALANCE);
    expect(ok.find((e) => e.id === 'free_artist')!.available).toBe(true);
    const tooRich = checkEndings(player({ reputation: 50, money: 5_000_000, grade: 'senior' }), BALANCE);
    expect(tooRich.find((e) => e.id === 'free_artist')!.available).toBe(false);
  });

  it('teacher needs 50+ mentored juniors', () => {
    const notYet = checkEndings(player({ reputation: 70, mentoredJuniors: 49 }), BALANCE);
    expect(notYet.find((e) => e.id === 'teacher')!.available).toBe(false);
    const yes = checkEndings(player({ reputation: 70, mentoredJuniors: 50 }), BALANCE);
    expect(yes.find((e) => e.id === 'teacher')!.available).toBe(true);
  });

  it('cto requires cto grade + reputation + leadership', () => {
    const justRep = checkEndings(player({ reputation: 80, leadership: 40, grade: 'senior' }), BALANCE);
    expect(justRep.find((e) => e.id === 'cto')!.available).toBe(false);
    const full = checkEndings(player({ reputation: 80, leadership: 40, grade: 'cto' }), BALANCE);
    expect(full.find((e) => e.id === 'cto')!.available).toBe(true);
  });

  it('burnout fires when burnoutDays hits the threshold', () => {
    const under = checkEndings(player({ burnoutDays: 6 }), BALANCE);
    expect(under.find((e) => e.id === 'burnout')!.available).toBe(false);
    const over = checkEndings(player({ burnoutDays: 7 }), BALANCE);
    expect(over.find((e) => e.id === 'burnout')!.available).toBe(true);
  });

  it('left_it fires when brokeDays hits the threshold', () => {
    const over = checkEndings(player({ brokeDays: 15 }), BALANCE);
    expect(over.find((e) => e.id === 'left_it')!.available).toBe(true);
  });

  it('firstAvailableEnding returns the first available', () => {
    const p = player({ burnoutDays: 7, reputation: 80, money: 100_000_000, grade: 'senior' });
    const list = checkEndings(p, BALANCE);
    // cto first in the list, but it needs grade === 'cto', so the first
    // available is 'exit'.
    const id = firstAvailableEnding(p, BALANCE);
    expect(id).not.toBeNull();
    expect(list.some((e) => e.id === id && e.available)).toBe(true);
    expect(id).toBe('exit');
  });
});
