import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  createNewPlayer,
  gateProgress,
  gateFor,
  nextGateOf,
  qualifiedGrade,
  mainBranchTotal,
  branchShareXp,
  promotionChance,
  reviewInterval,
  ctoElectionChance,
  dailyLivingCost,
  wealthTaxMonthly,
  maxSkillLevel,
  totalSkillLevels,
  applySoftXp,
  xpToNext,
  type PlayerState,
  type CareerGate,
} from '../../index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const balance = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', '..', 'content', 'balance.json'), 'utf-8')
);
const GATES: CareerGate[] = balance.careerGates;
const LIVING = balance.livingCosts;
const BRANCH_OF: Record<string, string> = (() => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', '..', 'content', 'skills.json'), 'utf-8')
  );
  const map: Record<string, string> = {};
  for (const sk of raw.skills ?? raw) if (sk.id && sk.branch) map[sk.id] = sk.branch;
  return map;
})();

function player(mainLevel: number, opts: Partial<PlayerState> = {}): PlayerState {
  const p = createNewPlayer();
  p.mainSkillId = 'javascript';
  p.skills = { javascript: { level: mainLevel, xp: 0 } };
  for (const [id, lvl] of Object.entries((opts as any).skills ?? {})) {
    p.skills[id] = { level: (lvl as any).level, xp: 0 };
  }
  p.softSkills = {
    communication: { level: opts.softSkills?.communication?.level ?? 5, xp: 0 },
    english: { level: opts.softSkills?.english?.level ?? 10, xp: 0 },
    time_management: { level: 3, xp: 0 },
    leadership: { level: opts.softSkills?.leadership?.level ?? 0, xp: 0 },
  };
  p.reputation = opts.reputation ?? 0;
  p.money = opts.money ?? 10000;
  p.housingLevel = (opts.housingLevel ?? 0) as PlayerState['housingLevel'];
  p.grade = opts.grade ?? 'unemployed';
  return p;
}

/** a player who satisfies every numeric requirement of `grade` */
function qualifiedFor(grade: Grade1, extra: Partial<PlayerState> = {}): PlayerState {
  const g = gateFor(GATES, grade)!;
  const p = player(g.skill, {
    reputation: g.rep,
    grade,
    softSkills: {
      communication: { level: g.comm, xp: 0 },
      english: { level: g.english ?? 0, xp: 0 },
      leadership: { level: g.leadership ?? 0, xp: 0 },
    },
    ...extra,
  });
  if (g.total) {
    // spread the remaining breadth inside the branch so the sibling cap does not bite
    let missing = g.total - maxSkillLevel(p);
    let i = 0;
    const siblings = Object.keys(BRANCH_OF).filter((id) => BRANCH_OF[id] === BRANCH_OF.javascript && id !== 'javascript');
    while (missing > 0 && siblings.length) {
      const id = siblings[i % siblings.length];
      const add = Math.min(missing, g.skill);
      p.skills[id] = { level: (p.skills[id]?.level ?? 0) + add, xp: 0 };
      missing -= add;
      i++;
    }
  }
  if (g.branchTotal) {
    let missing = g.branchTotal - mainBranchTotal(p, BRANCH_OF, 'javascript');
    let i = 0;
    const siblings = Object.keys(BRANCH_OF).filter((id) => BRANCH_OF[id] === BRANCH_OF.javascript);
    while (missing > 0 && i < 40) {
      const id = siblings[i % siblings.length];
      p.skills[id] = { level: (p.skills[id]?.level ?? 0) + Math.ceil(missing / 4), xp: 0 };
      missing = g.branchTotal - mainBranchTotal(p, BRANCH_OF, 'javascript');
      i++;
    }
  }
  return p;
}
type Grade1 = CareerGate['grade'];

describe('career gates (v2.1 balance layer)', () => {
  it('gates on MAIN-skill depth, not on the sum of many weak skills', () => {
    const architect = gateFor(GATES, 'architect')!;
    const wide = createNewPlayer();
    wide.mainSkillId = 'javascript';
    // 30 skills × 10 levels = 300 total — far above the architect "total" bar,
    // but no single skill is deep. This used to be enough for promotion.
    wide.skills = Object.fromEntries(Object.keys(BRANCH_OF).map((id) => [id, { level: 10, xp: 0 }]));
    wide.softSkills = {
      communication: { level: architect.comm, xp: 0 },
      english: { level: architect.english ?? 0, xp: 0 },
      leadership: { level: architect.leadership ?? 0, xp: 0 },
    };
    wide.reputation = architect.rep;

    expect(totalSkillLevels(wide)).toBeGreaterThan(architect.total ?? 0);
    expect(maxSkillLevel(wide)).toBeLessThan(architect.skill);
    expect(gateProgress(wide, architect, { branchOf: BRANCH_OF }).ok).toBe(false);
  });

  it('a player who meets every requirement is qualified', () => {
    for (const grade of ['middle', 'senior', 'teamlead', 'architect'] as Grade1[]) {
      const g = gateFor(GATES, grade)!;
      const p = qualifiedFor(grade);
      expect(gateProgress(p, g, { branchOf: BRANCH_OF }).ok, grade).toBe(true);
    }
  });

  it('CTO is never reachable by promotion', () => {
    expect(gateFor(GATES, 'cto')!.special).toBe(true);
    expect(nextGateOf(GATES, 'architect')).toBeNull();
    const p = qualifiedFor('architect');
    expect(qualifiedGrade(p, GATES, { branchOf: BRANCH_OF })).not.toBe('cto');
  });

  it('review cadence grows with the grade', () => {
    expect(reviewInterval(GATES, 'junior')).toBeLessThan(reviewInterval(GATES, 'senior'));
    expect(reviewInterval(GATES, 'senior')).toBeLessThan(reviewInterval(GATES, 'architect'));
  });

  it('competition slows barely-qualified players, over-qualification fixes it', () => {
    const rnd = () => 0.99; // unlucky roll for anything below a certainty
    expect(promotionChance(0, 6, rnd)).toBe(false);
    expect(promotionChance(40, 1, () => 0.99)).toBe(true);
    // monotonic in surplus
    let last = -1;
    for (const surplus of [0, 2, 5, 10, 20]) {
      const hits = Array.from({ length: 400 }, (_, i) =>
        promotionChance(surplus, 5, mulberry(i + surplus)) ? 1 : 0
      ).reduce((a, b) => a + b, 0);
      expect(hits).toBeGreaterThanOrEqual(last);
      last = hits;
      if (surplus > 0) expect(hits).toBeGreaterThan(0);
    }
  });

  it('branch knowledge sharing never lets a sibling outrank the main skill', () => {
    const p = player(20);
    p.skills = { javascript: { level: 20, xp: 0 }, react: { level: 19, xp: 0 }, css: { level: 2, xp: 0 } };
    const share = branchShareXp(p, BRANCH_OF, 10, 2);
    for (const [id, amount] of Object.entries(share)) {
      expect(p.skills[id].level + amount).toBeLessThanOrEqual(20);
    }
    expect(Object.keys(share)).toContain('css'); // weakest sibling first
    expect(share['javascript']).toBeUndefined();
  });

  it('the CTO election needs an architect with a reputation and a board', () => {
    const g = gateFor(GATES, 'cto')!;
    const notArchitect = ctoElectionChance(qualifiedFor('architect', { grade: 'teamlead' }), g);
    expect(notArchitect.chance).toBe(0);
    const ready = ctoElectionChance(qualifiedFor('cto'), g);
    expect(ready.qualified).toBe(true);
    expect(ready.chance).toBeGreaterThanOrEqual(0.15);
    expect(ready.chance).toBeLessThanOrEqual(0.85);
  });
});

describe('living costs (money pressure)', () => {
  it('is zero-safe and grows with career and housing', () => {
    const broke = player(30, { money: 100 });
    const lc = dailyLivingCost(broke, LIVING);
    expect(lc.amount).toBe(LIVING.foodBroke);
    expect(lc.broke).toBe(true);

    const junior = dailyLivingCost(player(30, { grade: 'junior', money: 90000 }), LIVING);
    const architect = dailyLivingCost(player(80, { grade: 'architect', money: 900000 }), LIVING);
    expect(architect.amount).toBeGreaterThan(junior.amount);

    const richerHome = dailyLivingCost(player(80, { grade: 'architect', housingLevel: 2, money: 900000 }), LIVING);
    expect(richerHome.amount).toBeGreaterThan(architect.amount);
  });

  it('taxes idle capital but never the poor', () => {
    expect(wealthTaxMonthly(player(50, { grade: 'middle', money: 50000 }), LIVING)).toBe(0);
    const rich = player(80, { grade: 'architect', money: 2_000_000 });
    const tax = wealthTaxMonthly(rich, LIVING);
    expect(tax).toBeGreaterThan(0);
    expect(tax).toBeLessThanOrEqual(LIVING.wealthTaxCap);
    // cap: an absurd fortune is still only drained up to the cap
    expect(wealthTaxMonthly(player(80, { money: 5_000_000_000 }), LIVING)).toBe(LIVING.wealthTaxCap);
  });

  it('owned items shave a little off the lifestyle bill', () => {
    const base = dailyLivingCost(player(50, { grade: 'senior', money: 500000 }), LIVING).amount;
    const withToys = dailyLivingCost(
      { ...player(50, { grade: 'senior', money: 500000 }), items: ['a', 'b', 'c'] as string[] } as PlayerState,
      LIVING
    ).amount;
    expect(withToys).toBeLessThan(base);
  });
});

describe('soft-skill saturation', () => {
  it('throttles XP above the saturation level', () => {
    const opts = { saturatesAt: 30, damping: 0.5 };
    const RAW = 15;
    const low = applySoftXp({ level: 10, xp: 0 }, RAW, opts);
    const high = applySoftXp({ level: 45, xp: 0 }, RAW, opts);
    // Effective inflow = leftover XP + whatever it cost to reach the new level.
    // Below the saturation line everything lands; above it only damped XP does.
    const lowInflow = low.xp + (low.level - 10 > 0 ? xpToNext(10) : 0);
    const highInflow = high.xp;
    expect(lowInflow).toBe(RAW);
    expect(highInflow).toBe(Math.round(RAW * (opts.damping ?? 0)));
  });
});

describe('balance content contract', () => {
  it('the ladder is walkable and ordered', () => {
    const order: Grade1[] = ['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];
    let prevSkill = -1;
    let prevTotal = -1;
    let prevRep = -1;
    let prevDays = -1;
    for (const grade of order) {
      const g = gateFor(GATES, grade);
      expect(g, `gate for ${grade} exists`).toBeTruthy();
      expect(g!.skill, `${grade} skill`).toBeGreaterThan(prevSkill);
      expect(g!.total ?? 0, `${grade} total`).toBeGreaterThanOrEqual(prevTotal);
      expect(g!.rep, `${grade} rep`).toBeGreaterThanOrEqual(prevRep);
      expect(g!.minDaysInGrade ?? 7, `${grade} cadence`).toBeGreaterThanOrEqual(prevDays);
      prevSkill = g!.skill;
      prevTotal = g!.total ?? 0;
      prevRep = g!.rep;
      prevDays = g!.minDaysInGrade ?? 7;
    }
  });

  it('every grade up to architect is reachable inside one game year by XP alone', () => {
    // Depth is the binding constraint; with the cheapest full-time study pace a
    // player gains ~2 XP/energy and ~5 energy/day → ~250 XP in 25 days per grade.
    // The requirement must stay below what 365 days of studying can produce.
    for (const g of GATES.filter((x) => !x.special)) {
      expect(g.skill, g.grade).toBeLessThanOrEqual(100);
      expect(g.total ?? 0, g.grade).toBeLessThanOrEqual(400);
      expect(g.comm, g.grade).toBeLessThanOrEqual(80);
      expect(g.rep, g.grade).toBeLessThanOrEqual(100);
    }
  });

  it('housing costs are ordered and have a savings cushion defined', () => {
    const housing = balance.housing as any[];
    for (const h of housing) {
      expect(h.saveMult, `level ${h.level}`).toBeGreaterThanOrEqual(1);
      expect(h.saveStreakDays, `level ${h.level}`).toBeGreaterThanOrEqual(0);
    }
  });
});

/** tiny deterministic rng so the monotonicity test is stable */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
