/**
 * Balance Simulator — section 18.4
 *
 * Runs 40 agents × 365 game days with a "reasonable player" policy.
 * Checks that all milestones fall within target corridors.
 *
 * Usage: tsx packages/sim/src/simulate.ts [--check]
 */

import {
  createNewPlayer,
  applyXp,
  calculateMaxEnergy,
  applyMotivationDrift,
  calculateRating,
  GRADE_REQUIREMENTS,
  GRADE_ORDER,
  xpToNext,
  totalSkillLevels,
  freelancePayment,
} from '@itsim/shared';

const RUNS = 40;
const DAYS = 365;
const SEED = 42;

// Target milestones from section 3.4
const MILESTONES: Record<string, { target: number; tolerance: number }> = {
  firstOffer: { target: 12, tolerance: 0.4 },
  intern: { target: 24, tolerance: 0.4 },
  middle: { target: 78, tolerance: 0.35 },
  senior: { target: 172, tolerance: 0.3 },
  teamlead: { target: 194, tolerance: 0.3 },
  architect: { target: 281, tolerance: 0.25 },
  housing_1: { target: 203, tolerance: 0.35 },
  housing_2: { target: 286, tolerance: 0.3 },
};

interface RunResult {
  milestones: Record<string, number>;
  finalState: {
    day: number;
    money: number;
    skills: number;
    grade: string;
    motivation: number;
    reputation: number;
    rating: number;
  };
  maxNoIncomeStreak: number;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function simulate(random: () => number): RunResult {
  const p = createNewPlayer();
  const milestones: Record<string, number> = {};
  let noIncomeDays = 0;
  let maxNoIncome = 0;
  let currentSkill = 'javascript';
  let hasJob = false;

  for (let day = 1; day <= DAYS; day++) {
    p.currentDay = day;

    // Actions per day (simplified policy)
    const actionsPerDay = Math.min(7, Math.floor(calculateMaxEnergy(p) / 3));
    let energySpent = 0;

    for (let a = 0; a < actionsPerDay && p.energy >= 2; a++) {
      // Reasonable player policy
      const action = chooseAction(p, hasJob, random);
      if (action === 'study') {
        const result = applyXp(
          p.skills[currentSkill] ?? { level: 0, xp: 0 },
          10,
          p.motivation
        );
        p.skills[currentSkill] = result;
        p.energy -= 2;
        energySpent += 2;
        p.money -= 2000; // study costs
      } else if (action === 'work' && hasJob) {
        const result = applyXp(
          p.skills[currentSkill] ?? { level: 0, xp: 0 },
          8,
          p.motivation
        );
        p.skills[currentSkill] = result;
        p.energy -= 4;
        energySpent += 4;
      } else if (action === 'freelance') {
        const payment = freelancePayment(
          p.skills[currentSkill]?.level ?? 5,
          p.reputation,
          random() < 0.5 ? 'easy' : 'medium'
        );
        p.money += payment;
        p.energy -= 3;
        energySpent += 3;
        noIncomeDays = 0;
      } else if (action === 'rest') {
        p.motivation = Math.min(100, p.motivation + 10);
        p.health = Math.min(100, p.health + 2);
        p.energy = Math.min(p.maxEnergy, p.energy + 2);
        energySpent += 1;
      }
    }

    // Track no-income streak
    if (p.money <= 0) {
      noIncomeDays++;
      maxNoIncome = Math.max(maxNoIncome, noIncomeDays);
    } else {
      noIncomeDays = 0;
    }

    // End day effects
    const drifted = applyMotivationDrift(p.motivation, p.health, hasJob, -0.3);
    p.motivation = drifted.motivation;

    // Check for job offer
    const totalSkill = totalSkillLevels(p);
    if (!hasJob && totalSkill >= 15 && day > 5) {
      // Simulate getting a job
      hasJob = true;
      const grade = determineGrade(totalSkill, p.reputation);
      p.grade = grade;
      recordMilestone(milestones, 'firstOffer', day);

      if (milestones.intern === undefined) {
        recordMilestone(milestones, 'intern', day);
      }
    }

    // Grade progression
    if (hasJob && day % 30 === 0) {
      const oldGrade = p.grade;
      const totalSkill = totalSkillLevels(p);
      const newGrade = determineGrade(totalSkill, p.reputation);
      if (GRADE_ORDER.indexOf(newGrade) > GRADE_ORDER.indexOf(oldGrade)) {
        p.grade = newGrade;
        const key = newGrade === 'middle' ? 'middle'
          : newGrade === 'senior' ? 'senior'
          : newGrade === 'teamlead' ? 'teamlead'
          : newGrade === 'architect' ? 'architect'
          : null;
        if (key && milestones[key] === undefined) {
          recordMilestone(milestones, key, day);
        }
      }
    }

    // Housing upgrade
    if (day % 30 === 0 && p.money >= 25000 * 3) {
      const newLevel = Math.min(4, p.housingLevel + 1);
      if (newLevel > p.housingLevel) {
        p.housingLevel = newLevel as any;
        if (newLevel >= 1 && milestones.housing_1 === undefined) {
          recordMilestone(milestones, 'housing_1', day);
        }
        if (newLevel >= 2 && milestones.housing_2 === undefined) {
          recordMilestone(milestones, 'housing_2', day);
        }
        p.money -= 25000 * newLevel;
      }
    }

    // Weekly salary
    if (hasJob && day % 7 === 0) {
      const salary = GRADE_REQUIREMENTS[p.grade]?.skill
        ? Math.round(GRADE_SALARIES[p.grade] / 4.3)
        : 0;
      p.money += Math.max(salary, 8000);
    }

    // Regen energy
    p.maxEnergy = calculateMaxEnergy(p);
    p.energy = Math.min(p.maxEnergy, p.energy + Math.floor(p.maxEnergy * 0.3));
  }

  return {
    milestones,
    finalState: {
      day: DAYS,
      money: p.money,
      skills: totalSkillLevels(p),
      grade: p.grade,
      motivation: p.motivation,
      reputation: p.reputation,
      rating: calculateRating(p),
    },
    maxNoIncomeStreak: maxNoIncome,
  };
}

function chooseAction(p: any, hasJob: boolean, random: () => number): string {
  // Reasonable player: prioritizes study/rest balance
  const roll = random();

  if (p.motivation < 30) return 'rest';
  if (hasJob && roll < 0.3) return 'work';
  if (!hasJob && roll < 0.5) return 'freelance';
  if (roll < 0.6) return 'rest';
  return 'study';
}

function determineGrade(skill: number, reputation: number): string {
  const grades = ['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect'];
  const reqs = [
    { skill: 18, rep: 0 },
    { skill: 32, rep: 5 },
    { skill: 55, rep: 15 },
    { skill: 76, rep: 30 },
    { skill: 80, rep: 42 },
    { skill: 90, rep: 58 },
  ];

  let grade = 'unemployed';
  for (let i = 0; i < grades.length; i++) {
    if (skill >= reqs[i].skill && reputation >= reqs[i].rep) {
      grade = grades[i];
    } else {
      break;
    }
  }
  return grade;
}

function recordMilestone(m: Record<string, number>, key: string, day: number) {
  if (m[key] === undefined) m[key] = day;
}

const GRADE_SALARIES: Record<string, number> = {
  intern: 35000,
  junior: 90000,
  middle: 220000,
  senior: 400000,
  teamlead: 520000,
  architect: 680000,
};

function main() {
  console.log('🚀 IT Life Simulator — Balance Simulator');
  console.log(`Running ${RUNS} agents × ${DAYS} days...\n`);

  const allResults: RunResult[] = [];

  for (let i = 0; i < RUNS; i++) {
    const random = rng(SEED + i * 1000);
    const result = simulate(random);
    allResults.push(result);
  }

  // Aggregate milestones
  const aggregate: Record<string, number[]> = {};
  for (const r of allResults) {
    for (const [key, val] of Object.entries(r.milestones)) {
      if (!aggregate[key]) aggregate[key] = [];
      aggregate[key].push(val);
    }
  }

  console.log('=== Milestone Results (median) ===');
  for (const [key, vals] of Object.entries(aggregate)) {
    vals.sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const target = MILESTONES[key];
    if (target) {
      const deviation = ((median - target.target) / target.target) * 100;
      const status = deviation < target.tolerance * 100 ? '✓' : '✗';
      console.log(`  ${status} ${key}: ${median} (target ${target.target}, ${deviation.toFixed(1)}%)`);
    } else {
      console.log(`  ? ${key}: ${median}`);
    }
  }

  // Aggregate final states
  const finalMoney = allResults.map(r => r.finalState.money).sort((a, b) => a - b);
  const finalSkills = allResults.map(r => r.finalState.skills).sort((a, b) => a - b);
  const maxNoIncome = allResults.map(r => r.maxNoIncomeStreak).sort((a, b) => a - b);

  console.log('\n=== Final State (median) ===');
  console.log(`  Money: ${Math.round(finalMoney[Math.floor(finalMoney.length / 2)]).toLocaleString()} ₽`);
  console.log(`  Skills: ${Math.round(finalSkills[Math.floor(finalSkills.length / 2)])}`);
  console.log(`  Max no-income streak: ${maxNoIncome[Math.floor(maxNoIncome.length * 0.9)]} days`);

  // Grade distribution
  const grades = allResults.map(r => r.finalState.grade);
  const gradeCounts: Record<string, number> = {};
  for (const g of grades) gradeCounts[g] = (gradeCounts[g] || 0) + 1;
  console.log('\n=== Grade Distribution ===');
  for (const [g, c] of Object.entries(gradeCounts).sort()) {
    console.log(`  ${g}: ${c}/${RUNS} (${((c / RUNS) * 100).toFixed(0)}%)`);
  }

  // Check: max no-income streak ≤ 10
  const maxStreak = Math.max(...maxNoIncome);
  console.log(`\n=== Compliance ===`);
  console.log(`  ${maxStreak <= 10 ? '✓' : '✗'} Max no-income streak: ${maxStreak} (≤ 10)`);

  // Check: all agents reach middle
  const reachedMiddle = allResults.filter(r => r.milestones.middle !== undefined).length;
  console.log(`  ${reachedMiddle === RUNS ? '✓' : '✗'} All reached Middle: ${reachedMiddle}/${RUNS}`);

  // Check: no dead ends
  const deadEnds = allResults.filter(r =>
    r.finalState.skills < 10 && r.finalState.money < 1000
  ).length;
  console.log(`  ${deadEnds === 0 ? '✓' : '✗'} Dead ends: ${deadEnds}`);

  console.log('\n✅ Simulation complete');
}

main();