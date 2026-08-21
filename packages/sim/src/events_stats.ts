/**
 * Event experience statistics (content + real engine).
 *
 * 1. Content stats: total events, pool breakdown, avg choices.
 * 2. Genetic variants: combinatorics of the avatar/room traits.
 * 3. Playthrough simulation: N agents × 365 days with a "reasonable
 *    player" policy, using the real pickEvent / maybeTriggerActionEvent /
 *    applyEventEffects engine — counts events a player actually sees.
 * 4. Outcome-space estimate: decision sequences, career paths, achievements.
 *
 * Usage: npx tsx packages/sim/src/events_stats.ts [--runs N]
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  pickEvent,
  maybeTriggerActionEvent,
  applyEventEffects,
  createNewPlayer,
  freelancePayment,
  type PlayerState,
  type GameEvent,
} from '@itsim/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentDir = join(__dirname, '..', '..', 'content');

const events: GameEvent[] = [];
for (const f of readdirSync(join(contentDir, 'events')).filter((f) => f.endsWith('.json'))) {
  events.push(...JSON.parse(readFileSync(join(contentDir, 'events', f), 'utf-8')));
}
const balance = JSON.parse(readFileSync(join(contentDir, 'balance.json'), 'utf-8'));
const genetics = JSON.parse(readFileSync(join(contentDir, 'genetics.json'), 'utf-8'));
const achievements = JSON.parse(readFileSync(join(contentDir, 'achievements.json'), 'utf-8'));

const RUNS = parseInt(process.argv[process.argv.indexOf('--runs') + 1] ?? '100', 10) || 100;
const DAYS = 365;
const ACTIONS_PER_DAY = parseInt(process.argv[process.argv.indexOf('--actions') + 1] ?? '5', 10) || 5;

// ---------------------------------------------------------------------------
// 1. Content stats
// ---------------------------------------------------------------------------

const dayEvents = events.filter((e) => !e.chainOnly && !e.actionTrigger);
const actionEvents = events.filter((e) => e.actionTrigger);
const chainEvents = events.filter((e) => e.chainOnly);
const avgChoices = events.reduce((s, e) => s + e.choices.length, 0) / events.length;
const ids = new Set(events.map((e) => e.id));

console.log('=== КОНТЕНТ ===');
console.log(`Всего событий: ${events.length} (уникальных id: ${ids.size})`);
console.log(`  дневной пул: ${dayEvents.length}`);
console.log(`  триггеры действий: ${actionEvents.length}`);
console.log(`  цепочки (chainOnly): ${chainEvents.length}`);
console.log(`Среднее число выборов в событии: ${avgChoices.toFixed(2)}`);

// ---------------------------------------------------------------------------
// 2. Genetic variants
// ---------------------------------------------------------------------------

console.log('\n=== ГЕНЕТИКА (DESIGN.md 3.1) ===');
const optionGroups: Array<[string, number]> = [
  ['глаза', genetics.eyes.length],
  ['причёски', genetics.hairstyles.length],
  ['цвет волос', genetics.hairPalette.length],
  ['тон кожи', genetics.skinTones.length],
  ['борода', genetics.beards.length],
  ['одежда', genetics.tops.length],
  ['аксессуары', genetics.accessories.length],
  ['форма окна', genetics.windows.length],
  ['цвет стен', genetics.wallPalette.length],
  ['декор', genetics.decorOptions.length],
];
let geneticCombos = 1;
for (const [name, count] of optionGroups) {
  geneticCombos *= count;
  console.log(`  ${name}: ${count}`);
}
console.log(`→ уникальных персонажей/комнат: ${geneticCombos.toLocaleString('ru-RU')}`);

// ---------------------------------------------------------------------------
// 3. Playthrough simulation
// ---------------------------------------------------------------------------

function eventPhaseChance(day: number): number {
  if (day <= 10) return balance.eventChanceOnboarding ?? 0.2;
  if (day <= 30) return balance.eventChanceEarly ?? 0.35;
  if (day <= 150) return balance.eventChanceMid ?? 0.28;
  return balance.eventChanceLate ?? 0.2;
}

interface RunStats {
  totalEvents: number;
  dayEvents: number;
  actionEvents: number;
  chainEvents: number;
  choices: number;
  distinct: number;
}

function gradeForDay(day: number): PlayerState['grade'] {
  if (day < 25) return 'unemployed';
  if (day < 50) return 'intern';
  if (day < 120) return 'junior';
  if (day < 210) return 'middle';
  if (day < 300) return 'senior';
  return 'teamlead';
}

function runAgent(seed: number): RunStats {
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const p = createNewPlayer() as PlayerState & { mainSkillId: string };
  p.mainSkillId = 'javascript';

  const stats: RunStats = { totalEvents: 0, dayEvents: 0, actionEvents: 0, chainEvents: 0, choices: 0, distinct: 0 };
  const seen = new Set<string>();
  let money = 10000;
  let lastFreelanceDay = 0;
  let freelanceDoneToday = false;

  const resolve = (ev: GameEvent, isChain: boolean) => {
    const choice = ev.choices[Math.floor(rng() * ev.choices.length)];
    stats.choices++;
    // Real effects: state evolves (skills, relations, money, chains)
    const updated = applyEventEffects(p, choice);
    Object.assign(p, updated);
    const hist = p.eventHistory[ev.id] ?? { lastDay: 0, count: 0 };
    p.eventHistory = { ...p.eventHistory, [ev.id]: { lastDay: p.currentDay, count: hist.count + 1 } };
    p.recentEventTags = [...p.recentEventTags, ...(ev.tags ?? [])].slice(-6);
    if (choice.chain && rng() < (choice.chain.chance ?? 1)) {
      p.pendingEvents = [
        ...p.pendingEvents.filter((pe) => pe.eventId !== choice.chain!.eventId),
        { eventId: choice.chain!.eventId, triggerDay: p.currentDay + choice.chain!.afterDays },
      ];
    }
    if (isChain) stats.chainEvents++;
  };

  for (let day = 1; day <= DAYS; day++) {
    p.currentDay = day;
    freelanceDoneToday = false;
    const hasJob = day > 25;
    p.grade = gradeForDay(day);
    p.job = hasJob
      ? { companyId: 'x', position: 'x', grade: p.grade, salary: 100000, energyPerDay: 4, daysWorked: 1, daysSinceLastPromotion: 0 }
      : null;

    // ---- day event roll ----
    if (rng() < eventPhaseChance(day)) {
      const ev = pickEvent(p, events, rng);
      if (ev) {
        const wasChain = p.pendingEvents.some((pe) => pe.eventId === ev.id);
        const pendingIdx = p.pendingEvents.findIndex((pe) => pe.eventId === ev.id);
        if (pendingIdx >= 0) p.pendingEvents.splice(pendingIdx, 1);
        stats.totalEvents++;
        stats.dayEvents++;
        if (!seen.has(ev.id)) { seen.add(ev.id); stats.distinct++; }
        resolve(ev, wasChain);
      }
    }

    // ---- actions ----
    let energy = p.energy;
    let actions = 0;
    let tries = 0;
    while (tries < 16 && actions < ACTIONS_PER_DAY) {
      tries++;
      const roll = rng();
      let actionId: string;
      let cost = 0;
      if (roll < 0.28) { actionId = 'study_youtube'; cost = 2; }
      else if (roll < 0.42) { actionId = hasJob ? 'work_task' : 'study_book'; cost = hasJob ? 4 : 1; }
      else if (roll < 0.56) { actionId = 'rest_walk'; cost = 1; }
      else if (roll < 0.68) { actionId = 'networking'; cost = 1; }
      else if (roll < 0.78) { actionId = 'rest_sleep'; cost = 0; }
      else if (roll < 0.88) { actionId = 'freelance'; cost = 4; }
      else if (roll < 0.94) { actionId = 'rest_bar'; cost = 2; }
      else { actionId = 'rest_hobby'; cost = 1; }

      if (energy < cost) continue;

      // money gates
      if (actionId === 'study_book' && money < 8000) continue;
      if (actionId === 'rest_bar' && money < 5000) continue;
      if (actionId === 'freelance') {
        if (freelanceDoneToday || day - lastFreelanceDay < 3) continue;
        lastFreelanceDay = day;
        freelanceDoneToday = true;
      }

      energy -= cost;
      actions++;

      // money flow from the action
      if (actionId === 'study_book') money -= 1500;
      else if (actionId === 'rest_bar') money -= 2000;
      else if (actionId === 'freelance') money += freelancePayment((p.skills['javascript']?.level ?? 0), p.reputation, 'easy');

      // ---- action-triggered follow-up ----
      const ev = maybeTriggerActionEvent(p, events, actionId, undefined, rng);
      if (ev) {
        stats.totalEvents++;
        stats.actionEvents++;
        if (!seen.has(ev.id)) { seen.add(ev.id); stats.distinct++; }
        resolve(ev, false);
      }
    }

    // ---- end of day ----
    if (hasJob && day % 7 === 0) money += 5000;
    money = Math.max(0, money);
    p.energy = Math.min(p.maxEnergy ?? 10, energy + Math.floor((p.maxEnergy ?? 10) * 0.5));
  }

  return stats;
}

console.log(`\n=== СИМУЛЯЦИЯ ПРОХОЖДЕНИЯ (${RUNS} агентов × ${DAYS} дней, до ${ACTIONS_PER_DAY} действий/день) ===`);
const runs: RunStats[] = [];
for (let i = 0; i < RUNS; i++) {
  runs.push(runAgent(42 + i * 1000));
}
const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const pct = (arr: number[], q: number) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * q)];

const totals = runs.map((r) => r.totalEvents);
const days = runs.map((r) => r.dayEvents);
const acts = runs.map((r) => r.actionEvents);
const chains = runs.map((r) => r.chainEvents);
const choices = runs.map((r) => r.choices);
const distinct = runs.map((r) => r.distinct);

console.log(`Событий за прохождение: среднее ${(totals.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)} · медиана ${med(totals)} · p10-p90: ${pct(totals, 0.1)}-${pct(totals, 0.9)}`);
console.log(`  из них дневных: ${(days.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)} · по действиям: ${(acts.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)} · цепочек: ${(chains.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)}`);
console.log(`Разных событий за прохождение (из ${events.length}): ${med(distinct)} (${((med(distinct) / events.length) * 100).toFixed(0)}% пула)`);
console.log(`Выборов сделано: среднее ${(choices.reduce((a, b) => a + b, 0) / RUNS).toFixed(0)} за прохождение`);

// ---------------------------------------------------------------------------
// 4. Outcome space
// ---------------------------------------------------------------------------

console.log('\n=== ВАРИАНТЫ ИСХОДОВ ===');
const avgEventsPerRun = med(totals);
const decisionSequences = Math.pow(avgChoices, avgEventsPerRun);
console.log(`Решения: в среднем ${avgEventsPerRun} событий × ${avgChoices.toFixed(2)} выбора = последовательностей решений`);
console.log(`  ≈ 10^${Math.floor(Math.log10(decisionSequences))} (${decisionSequences.toExponential(2)})`);

const careerPaths = 8 * 10 * 5 * 6; // грейды × компании × жильё × финалы (ТЗ)
console.log(`Макро-пути (по ТЗ): 8 грейдов × 10 компаний × 5 жилья × 6 финалов = ${careerPaths.toLocaleString('ru-RU')}`);
console.log(`Ачивки: 2^${achievements.length} = ${Math.pow(2, achievements.length).toLocaleString('ru-RU')} комбинаций`);

const storySpace = geneticCombos * decisionSequences;
console.log(`Полное пространство «историй» (генетика × решения): ≈ 10^${Math.floor(Math.log10(storySpace))}`);
console.log(`Вероятность двух одинаковых прохождений: практически нулевая (< 10^-${Math.floor(Math.log10(storySpace) / 2)})`);
