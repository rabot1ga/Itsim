/**
 * Balance Simulator — section 18.4
 *
 * Runs 40 agents × 365 game days with a "reasonable player" policy that
 * mirrors the server-side game rules (same shared engine, same balance.json).
 * Checks that all milestones fall within target corridors.
 *
 * Usage: tsx packages/sim/src/simulate.ts [--check]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  applyXp,
  applySoftXp,
  applyMotivationDrift,
  calculateMaxEnergy,
  calculateRating,
  totalSkillLevels,
  freelancePayment,
  interviewChance,
  rollInterview,
  weeklySalary,
  clamp,
  GRADE_REQUIREMENTS,
  GRADE_SALARIES,
  GRADE_ORDER,
  careerLevelIndex,
  HOUSING_COSTS,
  type Grade,
  type PlayerState,
} from '@itsim/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const balancePath = join(__dirname, '..', '..', 'content', 'balance.json');
const balance = JSON.parse(readFileSync(balancePath, 'utf-8'));
const XP_SOURCES: Record<string, { xp: number; energy: number; cost: number; maxLevel: number }> =
  balance.xpSources;
const NETWORKING = balance.networking ?? { commXp: 5, repGain: 0.5, energy: 2 };

const RUNS = 40;
const DAYS = 365;
const SEED = 42;

// Money safety net — below this the agent goes free/freelance
const MONEY_FLOOR = 5000;

// Money needed to keep studying from books — below this the agent
// takes freelance gigs to top up the budget
const STUDY_BUDGET = MONEY_FLOOR + XP_SOURCES.study_book.cost;

// Max actions per day — a reasonable player budgets around the daily
// energy regen (~30% of max energy) instead of burning the whole bank
const MAX_ACTIONS_PER_DAY = 7;

// Promotion review happens every N days (mirrors server rule)
const PROMO_COOLDOWN_DAYS = 7;

// Freelance gig cooldown by difficulty (mirrors server rule)
const FREELANCE_COOLDOWN_DAYS: Record<string, number> = { easy: 3, medium: 5, hard: 7 };

// Housing upgrade requires N× the cost saved up for M consecutive days
// (a real saving habit, not a one-day money spike)
const HOUSING_SAVE_MULT = 5;
const HOUSING_SAVE_DAYS = 14;


// Target milestones from section 3.4 (README)
const MILESTONES: Record<string, { target: number; tolerance: number }> = {
  firstOffer: { target: 12, tolerance: 0.4 },
  junior: { target: 24, tolerance: 0.4 },
  middle: { target: 78, tolerance: 0.35 },
  senior: { target: 172, tolerance: 0.3 },
  teamlead: { target: 194, tolerance: 0.3 },
  architect: { target: 281, tolerance: 0.25 },
  housing_1: { target: 203, tolerance: 0.35 },
  housing_2: { target: 286, tolerance: 0.3 },
};

const TRACKED_GRADES: Grade[] = ['junior', 'middle', 'senior', 'teamlead', 'architect'];

interface Agent {
  p: PlayerState;
  moneyAt100: number;
  moneyAt200: number;
  moneyAt300: number;
  maxMoney: number;
  hasJob: boolean;
  jobGrade: Grade;
  jobSalary: number;
  daysSinceLastPromotion: number;
  application: { grade: Grade; requirements: Record<string, number>; interviewDay: number } | null;
  milestones: Record<string, number>;
  noIncomeDays: number;
  maxNoIncome: number;
  freelanceToday: boolean;
  lastFreelanceDay: number;
  mainSkill: string;
  richDays: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function recordMilestone(m: Record<string, number>, key: string, day: number) {
  if (m[key] === undefined) m[key] = day;
}

/**
 * Best grade the agent qualifies for (skill + communication + reputation)
 */
function eligibleGrade(p: PlayerState): Grade | null {
  const comm = p.softSkills['communication']?.level ?? 0;
  let best: Grade | null = null;
  for (const grade of GRADE_ORDER) {
    if (grade === 'unemployed' || grade === 'cto') continue;
    const req = GRADE_REQUIREMENTS[grade];
    if (totalSkillLevels(p) >= req.skill && comm >= req.comm && p.reputation >= req.rep) {
      best = grade;
    }
  }
  return best;
}

/**
 * Requirements of the next career gate above the current grade
 */
function nextGate(p: PlayerState, current: Grade): { grade: Grade; skill: number; comm: number; rep: number } | null {
  const idx = careerLevelIndex(current);
  const next = GRADE_ORDER[idx + 1];
  if (!next || next === 'cto') return null;
  const req = GRADE_REQUIREMENTS[next];
  return { grade: next, skill: req.skill, comm: req.comm, rep: req.rep };
}

/**
 * Best study source for the current skill level: maximum XP per energy
 * among the sources that are affordable (keeping the safety net intact).
 * Falls back to free YouTube when broke.
 */
function pickStudySource(money: number, level: number): keyof typeof XP_SOURCES {
  const candidates: Array<keyof typeof XP_SOURCES> = [
    'study_youtube',
    'study_book',
    'study_stepik',
    'study_course',
    'study_advanced_course',
    'study_mentor',
  ];
  let best: keyof typeof XP_SOURCES = 'study_youtube';
  let bestValue = XP_SOURCES.study_youtube.xp / XP_SOURCES.study_youtube.energy;
  for (const id of candidates) {
    const def = XP_SOURCES[id];
    if (level >= def.maxLevel) continue; // source exhausted at this level
    if (money - def.cost < MONEY_FLOOR) continue; // keep the safety net
    const value = def.xp / def.energy;
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
}

function simulate(random: () => number): Agent {
  const p = createAgentPlayer();
  const agent: Agent = {
    p,
    hasJob: false,
    jobGrade: 'unemployed',
    jobSalary: 0,
    daysSinceLastPromotion: 0,
    application: null,
    milestones: {},
    moneyAt100: 0,
    moneyAt200: 0,
    moneyAt300: 0,
    maxMoney: 0,
    noIncomeDays: 0,
    maxNoIncome: 0,
    freelanceToday: false,
    lastFreelanceDay: 0,
    mainSkill: 'javascript',
    richDays: 0,
  };

  for (let day = 1; day <= DAYS; day++) {
    p.currentDay = day;
    agent.freelanceToday = false;

    // ---- Actions for the day ----
    let actions = 0;
    while (actions < MAX_ACTIONS_PER_DAY && p.energy >= 1) {
      const acted = agentAction(agent, random);
      if (!acted) break;
      actions++;
    }

    // ---- Money profile ----
    if (day === 100) agent.moneyAt100 = p.money;
    if (day === 200) agent.moneyAt200 = p.money;
    if (day === 300) agent.moneyAt300 = p.money;
    agent.maxMoney = Math.max(agent.maxMoney, p.money);

    // ---- No-income tracking ----
    if (p.money <= 0) {
      agent.noIncomeDays++;
      agent.maxNoIncome = Math.max(agent.maxNoIncome, agent.noIncomeDays);
    } else {
      agent.noIncomeDays = 0;
    }

    // ---- End-of-day effects (mirrors server advance-day) ----
    const jobCultureMot = agent.hasJob ? -0.3 : 0;
    const drift = applyMotivationDrift(p.motivation, p.health, agent.hasJob, jobCultureMot);
    p.motivation = drift.motivation;
    if (p.motivation <= 0) {
      p.burnoutDays += 1;
    } else if (p.motivation >= 50) {
      p.burnoutDays = 0;
    }

    // Job: promotion check (requirements must be met)
    if (agent.hasJob) {
      agent.daysSinceLastPromotion++;
      if (agent.daysSinceLastPromotion >= PROMO_COOLDOWN_DAYS) {
        const next = nextGate(p, agent.jobGrade);
        if (next && eligibleGrade(p) === next.grade) {
          agent.jobGrade = next.grade;
          agent.jobSalary = GRADE_SALARIES[next.grade];
          agent.daysSinceLastPromotion = 0;
          p.grade = next.grade;
          for (const g of TRACKED_GRADES) {
            if (next.grade === g) recordMilestone(agent.milestones, g, day);
          }
        }
      }
    }

    // Weekly salary
    if (agent.hasJob && day % 7 === 0) {
      p.money += weeklySalary(agent.jobSalary);
    }

    // Monthly rent
    if (day % 30 === 0) {
      const cost = HOUSING_COSTS[p.housingLevel] ?? 0;
      if (p.money >= cost) {
        p.money -= cost;
      } else {
        p.money = 0;
        p.motivation = clamp(p.motivation - 8, 0, 100);
      }
    }

    // Housing upgrade when the savings goal holds for several days straight
    if (p.housingLevel < 4) {
      const nextLevel = (p.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
      const cost = HOUSING_COSTS[nextLevel];
      if (p.money >= cost * HOUSING_SAVE_MULT) {
        agent.richDays++;
        if (agent.richDays >= HOUSING_SAVE_DAYS) {
          p.housingLevel = nextLevel;
          p.money -= cost;
          agent.richDays = 0;
          if (nextLevel >= 1) recordMilestone(agent.milestones, 'housing_1', day);
          if (nextLevel >= 2) recordMilestone(agent.milestones, 'housing_2', day);
        }
      } else {
        agent.richDays = 0;
      }
    }

    // Interview resolution
    if (agent.application && day >= agent.application.interviewDay) {
      resolveInterview(agent, random, day);
    }

    // Energy regen (40% of max, like the server)
    p.maxEnergy = calculateMaxEnergy(p);
    p.energy = Math.min(p.maxEnergy, p.energy + Math.floor(p.maxEnergy * 0.5));
  }

  return agent;
}

function createAgentPlayer(): PlayerState {
  return {
    version: 1,
    currentDay: 1,
    grade: 'unemployed',
    money: 10000,
    health: 80,
    motivation: 50,
    energy: 10,
    maxEnergy: 10,
    reputation: 0,
    bankedDays: 0,
    skills: {},
    perks: [],
    softSkills: {
      communication: { level: 5, xp: 0 },
      english: { level: 10, xp: 0 },
      time_management: { level: 3, xp: 0 },
    },
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
  };
}

function addXp(p: PlayerState, skillId: string, rawXp: number) {
  const current = p.skills[skillId] ?? { level: 0, xp: 0 };
  p.skills = { ...p.skills, [skillId]: applyXp(current, rawXp, p.motivation) };
}

function addCommXp(p: PlayerState, rawXp: number) {
  const comm = p.softSkills['communication'] ?? { level: 0, xp: 0 };
  p.softSkills = { ...p.softSkills, communication: applySoftXp(comm, rawXp) };
}

/**
 * One action of the "reasonable player". Returns false when the agent
 * has nothing left to do (or must stop for the day).
 */
function agentAction(a: Agent, random: () => number): boolean {
  const p = a.p;
  const comm = p.softSkills['communication']?.level ?? 0;
  const gate = a.hasJob ? nextGate(p, a.jobGrade) : { grade: 'intern' as Grade, skill: 18, comm: 8, rep: 0 };
  const rep = p.reputation;

  // 1. Apply for a job when ready
  if (!a.hasJob && !a.application && totalSkillLevels(p) >= 18 && comm >= 8) {
    const grade = eligibleGrade(p) ?? 'intern';
    a.application = {
      grade,
      requirements: { [a.mainSkill]: GRADE_REQUIREMENTS[grade].skill },
      interviewDay: p.currentDay + 2,
    };
    p.energy -= 1;
    return true;
  }

  // 2. Recover motivation when low
  if (p.motivation < 45) {
    p.energy -= 1;
    p.motivation = clamp(p.motivation + 8, 0, 100);
    p.health = clamp(p.health + 1, 0, 100);
    return true;
  }

  // 3. Emergency money: freelance when the study budget runs low
  const level = p.skills[a.mainSkill]?.level ?? 0;
  const difficulty = level < 25 ? 'easy' : level < 50 ? 'medium' : 'hard';
  const cooldown = FREELANCE_COOLDOWN_DAYS[difficulty];
  if (
    p.money < STUDY_BUDGET &&
    !a.freelanceToday &&
    p.currentDay - a.lastFreelanceDay >= cooldown &&
    level >= 3 &&
    p.energy >= 4
  ) {
    const payment = freelancePayment(level, p.reputation, difficulty);
    p.money += payment;
    p.energy -= 4;
    p.reputation = clamp(p.reputation + 0.2, 0, 100);
    a.freelanceToday = true;
    a.lastFreelanceDay = p.currentDay;
    addXp(p, a.mainSkill, 5);
    return true;
  }

  // 4. Train communication toward the career gate
  if (gate && comm < gate.comm) {
    p.energy -= NETWORKING.energy;
    addCommXp(p, NETWORKING.commXp);
    p.reputation = clamp(p.reputation + NETWORKING.repGain, 0, 100);
    return true;
  }

  // 5. Build reputation toward the career gate
  if (gate && rep < gate.rep + 2) {
    p.energy -= NETWORKING.energy;
    addCommXp(p, NETWORKING.commXp);
    p.reputation = clamp(p.reputation + NETWORKING.repGain, 0, 100);
    return true;
  }

  // 6. Study — best value source for the current level
  const source = pickStudySource(p.money, level);
  const def = XP_SOURCES[source];
  if (p.energy < def.energy) return false;
  p.energy -= def.energy;
  p.money -= def.cost;
  addXp(p, a.mainSkill, def.xp);
  return true;
}

function resolveInterview(a: Agent, random: () => number, day: number) {
  const app = a.application!;
  const skillLevels = Object.fromEntries(
    Object.entries(a.p.skills).map(([k, v]) => [k, v.level])
  );
  const chance = interviewChance({
    skills: skillLevels,
    requirements: app.requirements,
    communication: a.p.softSkills['communication']?.level ?? 0,
    reputation: a.p.reputation,
    companyBar: 1.0,
    answerScore: 0.7 + random() * 0.3,
  });

  const passed = rollInterview(chance, random);
  a.application = null;

  if (passed) {
    recordMilestone(a.milestones, 'firstOffer', day);
    // Accept the offer immediately
    a.hasJob = true;
    a.jobGrade = app.grade;
    a.jobSalary = GRADE_SALARIES[app.grade];
    a.daysSinceLastPromotion = 0;
    a.p.grade = app.grade;
    if (app.grade !== 'intern') {
      for (const g of TRACKED_GRADES) {
        if (app.grade === g) recordMilestone(a.milestones, g, day);
      }
    }
    a.p.job = {
      companyId: 'sim_company',
      position: app.grade,
      grade: app.grade,
      salary: a.jobSalary,
      energyPerDay: 0,
      daysWorked: 0,
      daysSinceLastPromotion: 0,
    };
  }
  // On failure the agent simply applies again (2-day interview cycle)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RunResult {
  milestones: Record<string, number>;
  money: number;
  moneyAt100: number;
  moneyAt200: number;
  moneyAt300: number;
  maxMoney: number;
  skills: number;
  grade: Grade;
  rating: number;
  maxNoIncome: number;
}

function main() {
  const checkMode = process.argv.includes('--check');
  console.log('🚀 IT Life Simulator — Balance Simulator');
  console.log(`Running ${RUNS} agents × ${DAYS} days...\n`);

  const results: RunResult[] = [];
  for (let i = 0; i < RUNS; i++) {
    const agent = simulate(rng(SEED + i * 1000));
    results.push({
      milestones: agent.milestones,
      money: agent.p.money,
      moneyAt100: agent.moneyAt100,
      moneyAt200: agent.moneyAt200,
      moneyAt300: agent.moneyAt300,
      maxMoney: agent.maxMoney,
      skills: totalSkillLevels(agent.p),
      grade: agent.p.grade,
      rating: calculateRating(agent.p),
      maxNoIncome: agent.maxNoIncome,
    });
  }

  let failed = false;

  // ---- Milestones (median) ----
  console.log('=== Milestone Results (median) ===');
  for (const [key, spec] of Object.entries(MILESTONES)) {
    const vals = results
      .map((r) => r.milestones[key])
      .filter((v): v is number => v !== undefined)
      .sort((x, y) => x - y);
    if (vals.length === 0) {
      console.log(`  ✗ ${key}: не достигнуто ни одним агентом`);
      failed = true;
      continue;
    }
    const median = vals[Math.floor(vals.length / 2)];
    const deviation = (median - spec.target) / spec.target;
    const ok = Math.abs(deviation) < spec.tolerance;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? '✓' : '✗'} ${key}: ${median} (target ${spec.target}, ${(deviation * 100).toFixed(1)}%)`
    );
  }

  const med = (arr: number[]) => arr.sort((x, y) => x - y)[Math.floor(arr.length / 2)];
  console.log('\n=== Money Profile (median) ===');
  console.log(`  money@100: ${Math.round(med(results.map((r) => r.moneyAt100))).toLocaleString()}`);
  console.log(`  money@200: ${Math.round(med(results.map((r) => r.moneyAt200))).toLocaleString()}`);
  console.log(`  money@300: ${Math.round(med(results.map((r) => r.moneyAt300))).toLocaleString()}`);
  console.log(`  maxMoney: ${Math.round(med(results.map((r) => r.maxMoney))).toLocaleString()}`);

  // ---- Final state ----
  const money = results.map((r) => r.money).sort((x, y) => x - y);
  const skills = results.map((r) => r.skills).sort((x, y) => x - y);
  const noIncome = results.map((r) => r.maxNoIncome).sort((x, y) => x - y);

  console.log('\n=== Final State (median) ===');
  console.log(`  Money: ${Math.round(money[Math.floor(money.length / 2)]).toLocaleString()} ₽`);
  console.log(`  Skills: ${Math.round(skills[Math.floor(skills.length / 2)])}`);
  console.log(`  Max no-income streak (p90): ${noIncome[Math.floor(noIncome.length * 0.9)]} days`);

  // ---- Grade distribution ----
  const gradeCounts: Record<string, number> = {};
  for (const r of results) gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1;
  console.log('\n=== Grade Distribution ===');
  for (const [g, c] of Object.entries(gradeCounts).sort()) {
    console.log(`  ${g}: ${c}/${RUNS} (${((c / RUNS) * 100).toFixed(0)}%)`);
  }

  // ---- Compliance ----
  const maxStreak = Math.max(...noIncome);
  const reachedMiddle = results.filter((r) => r.milestones.middle !== undefined).length;
  const deadEnds = results.filter((r) => r.skills < 10 && r.money < 1000).length;

  console.log('\n=== Compliance ===');
  console.log(`  ${maxStreak <= 10 ? '✓' : '✗'} Max no-income streak: ${maxStreak} (≤ 10)`);
  console.log(`  ${reachedMiddle === RUNS ? '✓' : '✗'} All reached Middle: ${reachedMiddle}/${RUNS}`);
  console.log(`  ${deadEnds === 0 ? '✓' : '✗'} Dead ends: ${deadEnds}`);

  if (maxStreak > 10 || reachedMiddle !== RUNS || deadEnds > 0) failed = true;

  console.log(`\n${failed ? '❌ Simulation FAILED' : '✅ Simulation complete'}`);

  if (checkMode && failed) {
    process.exit(1);
  }
}

main();
