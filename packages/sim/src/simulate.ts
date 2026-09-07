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
  maxSkillLevel,
  branchShareXp,
  dailyLivingCost,
  wealthTaxMonthly,
  freelancePayment,
  interviewChance,
  rollInterview,
  weeklySalary,
  clamp,
  GRADE_REQUIREMENTS,
  gateProgress,
  qualifiedGrade,
  promotionChance,
  reviewInterval,
  mainBranchTotal,
  nextGateOf,
  gateFor,
  ctoElectionChance,
  type CareerGate,
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
const LIVING = balance.livingCosts ?? null;
const ENDINGS = balance.endings ?? { burnoutDays: 7, brokeDaysToQuit: 15 };
const SOFT_OPTS = {
  saturatesAt: balance.softSkills?.saturatesAt ?? 30,
  damping: balance.softSkills?.xpDamping ?? 0.5,
};

// Career gates + branch map come from content (same source as the server)
const CAREER_GATES: CareerGate[] = (balance.careerGates ?? []) as CareerGate[];
const skillsPath = join(__dirname, '..', '..', 'content', 'skills.json');
const BRANCH_OF: Record<string, string> = (() => {
  const raw = JSON.parse(readFileSync(skillsPath, 'utf-8'));
  const list = raw.skills ?? raw;
  const map: Record<string, string> = {};
  for (const sk of list as any[]) if (sk.id && sk.branch) map[sk.id] = sk.branch;
  return map;
})();

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

// The board meets every N days to elect a CTO (server: cto_elect action + cooldown)
const CTO_ELECTION_DAYS = 60;

// Freelance gig cooldown by difficulty (mirrors server rule)
const FREELANCE_COOLDOWN_DAYS: Record<string, number> = { easy: 3, medium: 5, hard: 7 };

// Housing upgrade requires N× the cost saved up for M consecutive days
// (a real saving habit, not a one-day money spike)
const HOUSING_SAVE_MULT = 5;
const HOUSING_SAVE_DAYS = 20;
// The further up you move, the more of a *habit* it must be — per-level
// saveMult/saveStreakDays come from balance.housing (content, not code)
const HOUSING_DEFS: Record<number, { saveMult?: number; saveStreakDays?: number }> = {};
for (const h of (balance.housing ?? [])) HOUSING_DEFS[h.level] = h;

// Monthly income required per housing level (content: balance.housing[].incomeGateMult)
const HOUSING_INCOME_GATE: Record<number, number> = {};
for (const h of (balance.housing ?? [])) HOUSING_INCOME_GATE[h.level] = h.incomeGateMult ?? 0;


// Target milestones from section 3.4 (README)
const MILESTONES: Record<string, { target: number; tolerance: number }> = {
  firstOffer: { target: 16, tolerance: 0.25 },
  junior: { target: 30, tolerance: 0.2 },
  middle: { target: 74, tolerance: 0.2 },
  senior: { target: 150, tolerance: 0.2 },
  teamlead: { target: 205, tolerance: 0.15 },
  architect: { target: 285, tolerance: 0.15 },
  housing_1: { target: 203, tolerance: 0.25 },
  housing_2: { target: 286, tolerance: 0.25 },
};

const TRACKED_GRADES: Grade[] = ['junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];
// CTO is intentionally NOT a corridor-checked milestone: it is a second-year goal.
// The sim only reports how many reasonable players reached it within 365 days.
const CTO_MAX_SHARE = 0.35;

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
  ending: string | null;
  brokeStreak: number;
  ctoNextTryDay: number;
  blocked: boolean;
  networkedToday: boolean;
  lastFreelancePayment?: number;
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
/**
 * Gate evaluation on content data (v2.1): main-skill depth + branch breadth +
 * total breadth + soft skills + reputation. Falls back to the legacy sum-only
 * rule when content has no careerGates, so the sim never silently diverges
 * from a stripped-down content bundle.
 */
function gateCtx(p: PlayerState) {
  return { branchOf: BRANCH_OF };
}

function simQualifiedGrade(p: PlayerState): Grade | null {
  if (!CAREER_GATES.length) return eligibleGradeLegacy(p);
  const main = { ...(p as any), mainSkillId: p.mainSkillId ?? 'javascript' };
  return qualifiedGrade(main as PlayerState, CAREER_GATES, gateCtx(p));
}

/** lowest grade the player qualifies for — what they actually get hired as */
function simMinQualifiedGrade(p: PlayerState): Grade | null {
  if (!CAREER_GATES.length) return eligibleGradeLegacy(p);
  for (const gate of CAREER_GATES) {
    if (gate.grade === 'unemployed' || gate.special) continue;
    if (simGateProgress(p, gate).ok) return gate.grade;
  }
  return null;
}

function simGateProgress(p: PlayerState, gate: CareerGate) {
  const main = { ...(p as any), mainSkillId: p.mainSkillId ?? 'javascript' };
  return gateProgress(main as PlayerState, gate, gateCtx(p));
}

function simNextGate(current: Grade): CareerGate | null {
  if (!CAREER_GATES.length) return null;
  return nextGateOf(CAREER_GATES, current);
}

function simReviewInterval(current: Grade): number {
  if (!CAREER_GATES.length) return PROMO_COOLDOWN_DAYS;
  return reviewInterval(CAREER_GATES, current);
}

/** how far the weakest *binding* requirement is exceeded (0 when not qualified) */
function simSurplus(p: PlayerState, gate: CareerGate): number {
  const prog = simGateProgress(p, gate);
  if (!prog.ok) return -1;
  const margins = [
    maxSkillLevel(p) - gate.skill,
    (p.softSkills['communication']?.level ?? 0) - gate.comm,
    Math.round(p.reputation) - gate.rep,
  ];
  if (gate.total) margins.push(totalSkillLevels(p) - gate.total);
  if (gate.branchTotal) margins.push(mainBranchTotal(p as any, BRANCH_OF, p.mainSkillId ?? 'javascript') - gate.branchTotal);
  if (gate.english) margins.push((p.softSkills['english']?.level ?? 0) - gate.english);
  if (gate.leadership) margins.push((p.softSkills['leadership']?.level ?? 0) - gate.leadership);
  return Math.max(0, Math.min(...margins));
}

function eligibleGradeLegacy(p: PlayerState): Grade | null {
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
    ending: null,
    brokeStreak: 0,
    ctoNextTryDay: 1,
    blocked: false,
    networkedToday: false,
  };

  for (let day = 1; day <= DAYS; day++) {
    p.currentDay = day;
    agent.freelanceToday = false;
    agent.networkedToday = false;

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

    // ---- Daily living costs (ТЗ 5.6) — food, commute, subs ----
    if (LIVING) {
      const lc = dailyLivingCost({ ...(p as any), mainSkillId: p.mainSkillId ?? 'javascript' } as PlayerState, LIVING);
      if (p.money >= lc.amount) p.money -= lc.amount;
      else {
        p.money = 0;
        p.motivation = clamp(p.motivation - 2, 0, 100);
      }
      if (day % 30 === 0) {
        const tax = wealthTaxMonthly(p as PlayerState, LIVING);
        if (tax > 0) p.money = Math.max(0, p.money - tax);
      }
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

    // Job: promotion review — content gates + org budget (mirrors server tryPromote)
    if (agent.hasJob) {
      agent.daysSinceLastPromotion++;
      p.job = p.job ? { ...p.job, daysSinceLastPromotion: p.job.daysSinceLastPromotion + 1 } : p.job;

      const next = simNextGate(agent.jobGrade);
      if (next && agent.daysSinceLastPromotion >= simReviewInterval(agent.jobGrade)) {
        const progress = simGateProgress(p, next);
        if (progress.ok) {
          const surplus = Math.max(0, simSurplus(p, next));
          if (promotionChance(surplus, next.competition ?? 1, random)) {
            agent.jobGrade = next.grade;
            agent.jobSalary = GRADE_SALARIES[next.grade];
            agent.daysSinceLastPromotion = 0;
            p.job = p.job ? { ...p.job, grade: next.grade, salary: next.grade === agent.jobGrade ? agent.jobSalary : p.job.salary, daysSinceLastPromotion: 0 } : p.job;
            p.grade = next.grade;
            p.reputation = clamp(p.reputation + 3, 0, 100);
            for (const g of TRACKED_GRADES) {
              if (next.grade === g) recordMilestone(agent.milestones, g, day);
            }
          }
        }
      }

      // senior+: work also grows the branch (knowledge sharing) and leadership
      const gate = simNextGate(agent.jobGrade);
      if (gate) {
        const xp = Math.max(2, Math.round((XP_SOURCES.work_task?.xp ?? 8) / 2));
        for (const [id, share] of Object.entries(branchShareXp({ ...(p as any), mainSkillId: agent.mainSkill } as PlayerState, BRANCH_OF, xp, 2))) {
          addXp(p, id, share);
        }
        if (careerLevelIndex(agent.jobGrade) >= careerLevelIndex('middle')) {
          const carries = careerLevelIndex(agent.jobGrade) >= careerLevelIndex('senior');
          addSoftXpTo(p, 'leadership', carries ? 8 : 4);
        }
      }
    }

    // CTO: a board election, not a promotion (mirrors server cto_elect)
    if (p.grade === 'architect' && agent.hasJob && day >= agent.ctoNextTryDay) {
      const ctoGate = gateFor(CAREER_GATES, 'cto');
      if (ctoGate) {
        const { chance, qualified } = ctoElectionChance({ ...(p as any), mainSkillId: p.mainSkillId ?? agent.mainSkill } as PlayerState, ctoGate);
        // The board meets on a schedule; the candidate has to be ready that day
        agent.ctoNextTryDay = day + (ctoGate.electionIntervalDays ?? CTO_ELECTION_DAYS);
        if (qualified && chance > 0 && random() < chance) {
          p.grade = 'cto';
          agent.jobGrade = 'cto';
          agent.jobSalary = GRADE_SALARIES.cto;
          recordMilestone(agent.milestones, 'cto', day);
          recordMilestone(agent.milestones, 'ending_corporate_god', day);
          agent.ending = 'corporate_god';
        }
      }
    }

    // Career endings (ТЗ «Финалы»)
    if (!agent.ending) {
      if (p.motivation <= 0 && p.burnoutDays >= (ENDINGS.burnoutDays ?? 7)) {
        agent.ending = 'burnout';
        agent.blocked = true;
        p.job = null;
        agent.hasJob = false;
        recordMilestone(agent.milestones, 'ending_burnout', day);
      }
      if (p.money <= 0) agent.brokeStreak++;
      else agent.brokeStreak = 0;
      if (!agent.ending && agent.brokeStreak >= (ENDINGS.brokeDaysToQuit ?? 15) && !agent.hasJob) {
        agent.ending = 'left_it';
        agent.blocked = true;
        recordMilestone(agent.milestones, 'ending_left_it', day);
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
    // (and income is big enough for the lifestyle — mirrors the server gate)
    if (p.housingLevel < 4) {
      const nextLevel = (p.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
      const cost = HOUSING_COSTS[nextLevel];
      const incomeGate = HOUSING_INCOME_GATE[nextLevel] ?? 0;
      const income = (agent.hasJob ? agent.jobSalary : 0) + (agent.lastFreelancePayment ?? 0) * 4;
      const incomeOk = incomeGate <= 0 || income >= incomeGate;
      const def = HOUSING_DEFS[nextLevel] ?? {};
      const saveMult = def.saveMult ?? HOUSING_SAVE_MULT;
      const needDays = def.saveStreakDays ?? HOUSING_SAVE_DAYS;
      if (p.money >= cost * saveMult && incomeOk) {
        agent.richDays++;
        if (agent.richDays >= needDays) {
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
    mainSkillId: 'javascript',
    lastPromotionDay: 0,
  };
}

function addXp(p: PlayerState, skillId: string, rawXp: number) {
  const current = p.skills[skillId] ?? { level: 0, xp: 0 };
  p.skills = { ...p.skills, [skillId]: applyXp(current, rawXp, p.motivation) };
}

function addSoftXpTo(p: PlayerState, key: string, rawXp: number) {
  if (rawXp <= 0) return;
  const cur = p.softSkills[key] ?? { level: 0, xp: 0 };
  p.softSkills = { ...p.softSkills, [key]: applySoftXp(cur, rawXp, SOFT_OPTS) };
}

function addCommXp(p: PlayerState, rawXp: number) {
  addSoftXpTo(p, 'communication', rawXp);
}

/**
 * One action of the "reasonable player". Returns false when the agent
 * has nothing left to do (or must stop for the day).
 */
function agentAction(a: Agent, random: () => number): boolean {
  if (a.blocked || a.ending) return false; // burnout / quit: the policy stops acting
  const p = a.p;
  const comm = p.softSkills['communication']?.level ?? 0;
  const english = p.softSkills['english']?.level ?? 0;
  // Growth target: next promotion, or the CTO board election once you are the
  // top of the ladder — otherwise a qualified architect would stop growing.
  const gate = (a.hasJob ? simNextGate(a.jobGrade) : simNextGate('unemployed')) ?? gateFor(CAREER_GATES, 'cto') ?? null;
  const rep = p.reputation;

  // 1. Apply as soon as *any* gate is open — a reasonable player takes the offer
  // they can get now and grows inside the company, rather than hiding on the resume
  if (!a.hasJob && !a.application) {
    const grade = simMinQualifiedGrade(p);
    if (grade) {
      const g = gateFor(CAREER_GATES, grade);
      a.application = {
        grade,
        requirements: { [a.mainSkill]: g?.skill ?? GRADE_REQUIREMENTS[grade].skill },
        interviewDay: p.currentDay + 2,
      };
      p.energy -= 1;
      return true;
    }
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
    a.lastFreelancePayment = payment;
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

  // 5. Build reputation toward the career gate (networking = soft career skills:
  //    communication, reputation and a drip of leadership). Capped once a day,
  //    exactly like the server: meetups are not farmable.
  if (gate && !a.networkedToday) {
    const needSoft = comm < gate.comm || rep < gate.rep + 2;
    if (needSoft) {
      a.networkedToday = true;
      p.energy -= NETWORKING.energy;
      addCommXp(p, NETWORKING.commXp);
      p.reputation = clamp(p.reputation + NETWORKING.repGain, 0, 100);
      const seniorPlus = careerLevelIndex(p.grade) >= careerLevelIndex('senior');
      addSoftXpTo(p, 'leadership', Math.round((NETWORKING.leadershipPerDay ?? 0) * (seniorPlus ? 2 : 1)));
      return true;
    }
  }

  // 5a. English, when the gate asks for it (companies gate on it too)
  if (gate?.english && english < gate.english) {
    const def = XP_SOURCES.study_english_course;
    const cost = def?.cost ?? 0;
    if (p.energy >= 2 && p.money - cost >= MONEY_FLOOR) {
      p.energy -= 2;
      if (cost) p.money -= cost;
      p.softSkills = { ...p.softSkills, english: applySoftXp(p.softSkills['english'] ?? { level: 0, xp: 0 }, 10) };
      return true;
    }
  }

  // 5b. Branch breadth: gates need depth AND the branch behind it. A reasonable
  // player trains the weakest sibling skill of their branch when it is the blocker.
  if (gate?.branchTotal) {
    const have = mainBranchTotal(p as any, BRANCH_OF, a.mainSkill);
    if (have < gate.branchTotal) {
      const level = p.skills[a.mainSkill]?.level ?? 0;
      const sibling = Object.entries(p.skills)
        .filter(([id]) => id !== a.mainSkill && BRANCH_OF[id] === BRANCH_OF[a.mainSkill])
        .sort((x, y) => x[1].level - y[1].level)[0]?.[0];
      const target = sibling ?? Object.keys(BRANCH_OF).find((id) => BRANCH_OF[id] === BRANCH_OF[a.mainSkill] && id !== a.mainSkill)!;
      const have2 = p.skills[target]?.level ?? 0;
      if (have2 <= level) {
        const source = pickStudySource(p.money, have2);
        const def = XP_SOURCES[source];
        if (p.energy >= def.energy && p.money - def.cost >= MONEY_FLOOR) {
          p.energy -= def.energy;
          p.money -= def.cost;
          addXp(p, target, def.xp);
          return true;
        }
      }
    }
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
  ending: string | null;
  livingCost: number;
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
      ending: agent.ending,
      livingCost: LIVING ? dailyLivingCost(agent.p, LIVING).amount : 0,
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

  // ---- Career outcomes (v2.1) ----
  const endingCounts: Record<string, number> = {};
  for (const r of results) {
    const key = r.ending ?? 'running';
    endingCounts[key] = (endingCounts[key] || 0) + 1;
  }
  const ctoDay = results.map((r) => r.milestones.cto).filter((v): v is number => v !== undefined).sort((x, y) => x - y);
  const living = results.map((r) => r.livingCost).sort((x, y) => x - y);
  console.log('\n=== Career Outcomes ===');
  console.log(`  endings: ${Object.entries(endingCounts).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  living cost / day (median): ${Math.round(living[Math.floor(living.length / 2)]).toLocaleString()} ₽`);
  if (ctoDay.length) console.log(`  CTO elected: ${ctoDay.length}/${RUNS}, median day ${ctoDay[Math.floor(ctoDay.length / 2)]}`);

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

  // Late-game pacing: nobody should be at the top of the ladder by the middle
  // of the year, and the ladder must not be a straight line to architect.
  const architectBy250 = results.filter((r) => (r.milestones.architect ?? Infinity) <= 250).length;
  const architectShare = results.filter((r) => r.milestones.architect !== undefined).length / RUNS;
  const ctoShare = results.filter((r) => r.milestones.cto !== undefined).length / RUNS;
  const burnoutShare = (endingCounts.burnout ?? 0) / RUNS;
  console.log(`  ${architectBy250 <= RUNS * 0.25 ? '✓' : '✗'} Architect before day 250: ${architectBy250}/${RUNS} (≤ 25%)`);
  console.log(`  ${architectShare >= 0.5 ? '✓' : '✗'} Architect share by 365: ${(architectShare * 100).toFixed(0)}% (≥ 50%: the ladder is walkable)`);
  console.log(`  ${ctoShare <= CTO_MAX_SHARE ? '✓' : '✗'} CTO by 365: ${(ctoShare * 100).toFixed(0)}% (≤ ${(CTO_MAX_SHARE * 100).toFixed(0)}% — endgame must stay hard)`);
  console.log(`  ${burnoutShare <= 0.2 ? '✓' : '✗'} Burnout endings: ${(burnoutShare * 100).toFixed(0)}% (≤ 20%)`);

  if (
    maxStreak > 10 ||
    reachedMiddle !== RUNS ||
    deadEnds > 0 ||
    architectBy250 > RUNS * 0.25 ||
    architectShare < 0.5 ||
    ctoShare > CTO_MAX_SHARE ||
    burnoutShare > 0.2
  ) failed = true;

  console.log(`\n${failed ? '❌ Simulation FAILED' : '✅ Simulation complete'}`);

  if (checkMode && failed) {
    process.exit(1);
  }
}

/**
 * Diagnostics: `--why` prints what blocked the median agent's next promotion.
 */
function reportBlockers() {
  console.log('\n=== Blockers (--why) ===');
  for (let i = 0; i < 2; i++) {
    const a = simulate(rng(SEED + i * 1000));
    console.log(`  run#${i} milestones: ${Object.entries(a.milestones).map(([k, v]) => `${k}@${v}`).join(' ')}`);
  }
  for (let i = 0; i < 5; i++) {
    const agent = simulate(rng(SEED + i * 1000));
    const p = agent.p;
    const gate = simNextGate(agent.jobGrade) ?? gateFor(CAREER_GATES, 'intern');
    const prog = gate ? simGateProgress(p, gate) : null;
    const ctoG = gateFor(CAREER_GATES, 'cto');
    const ctoDiag = ctoG ? simGateProgress(p, ctoG) : null;
    const ctoChance = ctoG ? ctoElectionChance({ ...(p as any), mainSkillId: p.mainSkillId ?? 'javascript' } as PlayerState, ctoG) : null;
    console.log(
      `  run#${i} CTO: qualified=${ctoDiag?.ok} missing=${Object.entries(ctoDiag?.missing ?? {}).map(([k, v]) => `${k} ${v.current}/${v.needed}`).join(',') || '-'} chance=${ctoChance?.qualified ? Math.round(ctoChance.chance * 100) + '%' : 'n/a'}`
    );
    console.log(
      `  run#${i} grade=${p.grade} day=${p.currentDay} money=${Math.round(p.money).toLocaleString()} ` +
      `mainSkill=${maxSkillLevel(p)} total=${totalSkillLevels(p)} comm=${p.softSkills['communication']?.level ?? 0} ` +
      `eng=${p.softSkills['english']?.level ?? 0} lead=${p.softSkills['leadership']?.level ?? 0} rep=${p.reputation.toFixed(1)} ` +
      `mot=${p.motivation} hp=${p.health}` +
      (gate ? ` | next=${gate.grade} missing=${Object.entries(prog!.missing).map(([k, v]) => `${k} ${v.current}/${v.needed}`).join(',') || 'none'}` : '')
    );
  }
}

if (process.argv.includes('--why')) reportBlockers();

main();
