/**
 * Balance Simulator — 40 agents x 365 days
 */

import {
  createNewPlayer,
  applyXp,
  calculateMaxEnergy,
  GRADE_REQUIREMENTS,
  GRADE_ORDER,
  GRADE_SALARIES,
  maxSkillLevel,
  freelancePayment,
  weeklySalary,
  clamp,
  applyMotivationDrift,
} from '@itsim/shared';

const RUNS = 40;
const DAYS = 365;
const SEED = 42;

const TARGETS: Record<string, number> = {
  firstOffer: 12, intern: 24, middle: 78, senior: 172, teamlead: 194, architect: 281,
};

interface RunResult {
  firstOfferDay: number;
  gradeDays: Record<string, number>;
  finalGrade: string;
  finalMoney: number;
  finalReputation: number;
  maxZeroMoneyStreak: number;
}

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function simulate(rng: () => number): RunResult {
  const p = createNewPlayer();
  p.money = 16000;
  let hasJob = false;
  let jobGrade: string | null = null;
  let consecutiveZero = 0;
  let maxZeroStreak = 0;
  const gradeDays: Record<string, number> = {};
  const primary = 'javascript';

  for (let day = 1; day <= DAYS; day++) {
    p.currentDay = day;
    p.maxEnergy = calculateMaxEnergy(p);

    if (day > 1) {
      p.energy = Math.min(p.maxEnergy, p.energy + Math.floor(p.maxEnergy * 0.4) + 2);
    }

    const maxActions = clamp(Math.floor(p.energy / 2.5), 2, 6);

    for (let a = 0; a < maxActions && p.energy >= 2; a++) {
      const roll = rng();

      if (p.motivation < 20) {
        p.motivation = clamp(p.motivation + 15, 0, 100);
        p.health = clamp(p.health + 2, 0, 100);
        p.energy += 1;
        continue;
      }

      if (!hasJob) {
        if (p.money < 6000) {
          const sl = p.skills[primary]?.level ?? 5;
          const pay = freelancePayment(Math.max(5, sl), p.reputation, 'medium');
          p.money += Math.round(pay);
          p.energy -= 3;
        } else {
          const cur = p.skills[primary] ?? { level: 0, xp: 0 };
          p.skills[primary] = applyXp(cur, 12 + rng() * 6, p.motivation);
          p.energy -= 2;
        }
      } else {
        if (roll < 0.6) {
          const cur = p.skills[primary] ?? { level: 0, xp: 0 };
          p.skills[primary] = applyXp(cur, 8 + rng() * 4, p.motivation);
          p.energy -= 4;
          p.motivation = clamp(p.motivation - 1, 0, 100);
          p.health = clamp(p.health - 0.4, 0, 100);
        } else if (roll < 0.85) {
          const cur = p.skills[primary] ?? { level: 0, xp: 0 };
          p.skills[primary] = applyXp(cur, 12 + rng() * 6, p.motivation);
          p.energy -= 2;
        } else {
          p.motivation = clamp(p.motivation + 12, 0, 100);
          p.health = clamp(p.health + 2, 0, 100);
          p.energy += 1;
        }
      }
    }

    p.money -= 350;
    p.health = clamp(p.health + 0.3, 0, 100);
    const drift = applyMotivationDrift(p.motivation, p.health, hasJob, hasJob ? -0.3 : 0);
    p.motivation = drift.motivation;

    if (!hasJob && day > 5 && maxSkillLevel(p) >= 12) {
      hasJob = true;
      jobGrade = 'intern';
      p.grade = 'intern';
      gradeDays['firstOffer'] = day;
      gradeDays['intern'] = day;
    }

    if (hasJob && day % 7 === 0 && jobGrade) {
      p.money += weeklySalary(GRADE_SALARIES[jobGrade as keyof typeof GRADE_SALARIES] ?? 35000);
    }

    if (day % 30 === 0) {
      const costs = [5000, 25000, 50000, 40000, 150000];
      p.money -= costs[p.housingLevel] ?? 5000;
      if (p.money < 0) p.housingLevel = 0;
    }

    if (hasJob && day % 15 === 0 && jobGrade) {
      const curIdx = GRADE_ORDER.indexOf(jobGrade as any);
      const ms = maxSkillLevel(p);
      let newGrade = jobGrade;
      for (let i = curIdx + 1; i < GRADE_ORDER.length; i++) {
        const g = GRADE_ORDER[i];
        if (g === 'unemployed' || g === 'cto') continue;
        const req = GRADE_REQUIREMENTS[g];
        if (!req) continue;
        if (ms >= req.skill && p.reputation >= req.rep) {
          newGrade = g;
        } else break;
      }
      if (newGrade !== jobGrade && GRADE_ORDER.indexOf(newGrade as any) > curIdx) {
        jobGrade = newGrade;
        p.grade = newGrade as any;
        if (!gradeDays[newGrade]) gradeDays[newGrade] = day;
      }
    }

    p.reputation = clamp(p.reputation + 0.15, 0, 100);

    if (p.money <= 0) {
      consecutiveZero++;
      maxZeroStreak = Math.max(maxZeroStreak, consecutiveZero);
    } else {
      consecutiveZero = 0;
    }
  }

  return {
    firstOfferDay: gradeDays['firstOffer'] ?? 999,
    gradeDays,
    finalGrade: p.grade,
    finalMoney: p.money,
    finalReputation: p.reputation,
    maxZeroMoneyStreak: maxZeroStreak,
  };
}

function main() {
  console.log('IT Life Simulator v2.0 - Balance Simulator');
  console.log(RUNS + ' agents x ' + DAYS + ' days\n');

  const results: RunResult[] = [];
  for (let i = 0; i < RUNS; i++) {
    results.push(simulate(seededRandom(SEED + i * 137)));
  }

  const fos = results.map(r => r.firstOfferDay).sort((a, b) => a - b);
  const medFO = fos[Math.floor(fos.length / 2)];
  const avgFO = Math.round(fos.reduce((s, v) => s + v, 0) / fos.length);
  const allJob = results.filter(r => r.firstOfferDay < 999).length;
  console.log('First offer: median=' + medFO + ' avg=' + avgFO + ' target=' + TARGETS.firstOffer + ' all=' + allJob + '/' + RUNS);

  console.log('\nProgression:');
  for (const g of ['intern','junior','middle','senior','teamlead','architect']) {
    const reached = results.filter(r => r.gradeDays[g] !== undefined);
    const days = reached.map(r => r.gradeDays[g]).sort((a, b) => a - b);
    const med = days.length > 0 ? days[Math.floor(days.length / 2)] : '-';
    const pct = Math.round(reached.length / RUNS * 100);
    console.log('  ' + g.padEnd(12) + ' ' + pct + '% med: ' + med + 'd target: ' + (TARGETS[g] ?? '-'));
  }

  const moneys = results.map(r => r.finalMoney).sort((a, b) => a - b);
  console.log('\nMoney: median=' + moneys[Math.floor(moneys.length / 2)].toLocaleString());

  const gdist: Record<string, number> = {};
  for (const r of results) gdist[r.finalGrade] = (gdist[r.finalGrade] ?? 0) + 1;
  console.log('Final grades:');
  for (const [g, c] of Object.entries(gdist).sort()) {
    console.log('  ' + g.padEnd(12) + ' ' + c + '/' + RUNS);
  }

  const streaks = results.map(r => r.maxZeroMoneyStreak).sort((a, b) => a - b);
  const middleReached = results.filter(r => r.gradeDays['middle'] !== undefined).length;
  const seniorReached = results.filter(r => r.gradeDays['senior'] !== undefined).length;

  console.log('\nCompliance:');
  console.log('  Got job: ' + allJob + '/' + RUNS);
  console.log('  Middle: ' + middleReached + '/' + RUNS);
  console.log('  Senior: ' + seniorReached + '/' + RUNS);
  console.log('  Max zero streak: ' + streaks[streaks.length - 1] + 'd');
  console.log('\nDone!');
}

main();