import { PlayerState, Grade, CareerGate, LivingCosts } from '../types';
import { careerLevelIndex, GRADE_ORDER, HOUSING_COSTS } from './economy';
import { totalSkillLevels, maxSkillLevel, mainSkillLevel } from './skills';

/**
 * Career gates — data-driven promotion ladder (content: balance.careerGates).
 *
 * Why this exists: the first implementation gated grades on `totalSkillLevels`
 * (the sum over 34 skills), which any grinding player passes by day ~200, so a
 * "reasonable player" ended up architect in 100% of simulator runs. Real career
 * gates on *depth* (max skill level), on soft skills and on the org itself:
 * someone has to make room for you.
 *
 * A gate is therefore:
 *   - `skill`        — minimum level of the MAIN skill (depth, not sum)
 *   - `branchTotal`  — minimum sum of levels inside the main skill's branch
 *   - `total`        — minimum sum over all skills (breadth, still matters)
 *   - `comm`/`english`/`leadership`/`rep` — personal requirements
 *   - `minDaysInGrade` — review cycle; higher grades are reviewed rarer
 *   - `competition`    — candidates per open slot (budget), drives probability
 *   - `special`        — grades that cannot be reached by promotion at all (CTO)
 */

export interface GateProgress {
  grade: Grade;
  label: string;
  ok: boolean;
  /** requirement key → { current, needed } */
  missing: Record<string, { current: number; needed: number }>;
  /** 0..1 — how close the player is, averaged over requirements */
  progress: number;
}

/**
 * Sum of skill levels inside the branch of the player's main skill.
 * `branchOf` maps skillId → branch (built from content by the server/sim).
 */
export function mainBranchTotal(
  p: PlayerState,
  branchOf: Record<string, string>,
  mainSkillId?: string
): number {
  const main = mainSkillId ?? p.mainSkillId;
  const branch = main ? branchOf[main] : undefined;
  if (!branch) return 0;
  let total = 0;
  for (const [skillId, lvl] of Object.entries(p.skills)) {
    if (branchOf[skillId] === branch) total += lvl.level;
  }
  return total;
}

/**
 * The next grade the player can actually be promoted to, or null if they
 * already sit at the top of the promotion ladder (or are a CTO).
 */
export function nextGateOf(gates: CareerGate[], current: Grade): CareerGate | null {
  const idx = GRADE_ORDER.indexOf(current);
  for (let i = idx + 1; i < GRADE_ORDER.length; i++) {
    const grade = GRADE_ORDER[i];
    const gate = gates.find((g) => g.grade === grade);
    if (!gate) continue;
    if (gate.special) return null; // CTO is not a promotion
    return gate;
  }
  return null;
}

export function gateFor(gates: CareerGate[], grade: Grade): CareerGate | undefined {
  return gates.find((g) => g.grade === grade);
}

/**
 * Full gate evaluation — used by promotion logic, application pre-screen and UI.
 */
export function gateProgress(
  p: PlayerState,
  gate: CareerGate,
  ctx: { branchOf?: Record<string, string>; discount?: number } = {}
): GateProgress {
  const discount = Math.min(0.5, Math.max(0, ctx.discount ?? 0));
  const need = (v: number) => Math.round(v * (1 - discount));

  const comm = p.softSkills['communication']?.level ?? 0;
  const english = p.softSkills['english']?.level ?? 0;
  const leadership = p.softSkills['leadership']?.level ?? 0;
  const mainSkill = mainSkillLevel(p);
  const bestSkill = maxSkillLevel(p);

  const checks: Array<[string, number, number]> = [
    ['skill', Math.max(mainSkill, bestSkill), need(gate.skill)],
    ['total', totalSkillLevels(p), need(gate.total ?? 0)],
    ['comm', comm, need(gate.comm)],
    ['rep', Math.round(p.reputation), need(gate.rep)],
  ];
  if (gate.english) checks.push(['english', english, need(gate.english)]);
  if (gate.leadership) checks.push(['leadership', leadership, need(gate.leadership)]);
  if (gate.branchTotal && ctx.branchOf) {
    checks.push(['branchTotal', mainBranchTotal(p, ctx.branchOf), need(gate.branchTotal)]);
  }

  const missing: GateProgress['missing'] = {};
  let ratioSum = 0;
  for (const [key, current, needed] of checks) {
    ratioSum += needed > 0 ? Math.min(1, current / needed) : 1;
    if (current < needed) missing[key] = { current, needed };
  }

  return {
    grade: gate.grade,
    label: gate.label ?? gate.grade,
    ok: Object.keys(missing).length === 0,
    missing,
    progress: ratioSum / checks.length,
  };
}

/**
 * Highest grade the player personally qualifies for (ignores the org budget).
 */
export function qualifiedGrade(p: PlayerState, gates: CareerGate[], ctx: { branchOf?: Record<string, string>; discount?: number } = {}): Grade | null {
  let best: Grade | null = null;
  for (const gate of gates) {
    if (gate.grade === 'unemployed' || gate.special) continue;
    if (gateProgress(p, gate, ctx).ok) best = gate.grade;
  }
  return best;
}

/**
 * Probability that a qualified candidate actually gets the promotion when the
 * review comes around. Requirements open the review; the competition decides.
 * A single point of surplus roughly halves the waiting time, so barely-qualified
 * players still move — just slowly, and with something to talk about.
 */
export function promotionChance(surplus: number, competition: number, rng: () => number): boolean {
  const comp = Math.max(1, competition);
  const p = 1 / (1 + comp * Math.exp(-0.7 * Math.max(0, surplus)));
  return rng() < p;
}

/**
 * Surplus of the binding requirement (how much the weakest check is exceeded).
 */
export function gateSurplus(progress: GateProgress): number {
  let worst = Infinity;
  for (const { current, needed } of Object.values(progress.missing)) {
    worst = Math.min(worst, current - needed);
  }
  if (!Number.isFinite(worst)) {
    // No missing entries: surplus is the smallest relative margin over all checks.
    return 8; // comfortably above the bar → near-certain promotion
  }
  return Math.max(0, worst);
}

/**
 * Days since the last promotion must be at least this before a review happens.
 */
export function reviewInterval(gates: CareerGate[], current: Grade): number {
  const idx = GRADE_ORDER.indexOf(current);
  const next = idx >= 0 ? GRADE_ORDER[idx + 1] : null;
  const gate = next ? gateFor(gates, next) : null;
  return gate?.minDaysInGrade ?? 7;
}

/**
 * Board election (CTO): a one-off, reputation-critical, high-variance roll.
 * Not a promotion — you are elected, and you can lose.
 */
export function ctoElectionChance(
  p: PlayerState,
  gate: CareerGate
): { chance: number; qualified: boolean; missing: GateProgress['missing'] } {
  const progress = gateProgress(p, gate);
  if (!progress.ok) return { chance: 0, qualified: false, missing: progress.missing };
  const repSurplus = p.reputation - gate.rep;
  const leadSurplus = (p.softSkills['leadership']?.level ?? 0) - (gate.leadership ?? 0);
  const chance = Math.min(0.85, 0.35 + 0.02 * repSurplus + 0.015 * leadSurplus);
  return { chance: Math.max(0.15, chance), qualified: true, missing: {} };
}

/**
 * Knowledge sharing: on the job you also grow the neighbouring skills of your
 * branch, never above your main skill (you learn from your own depth).
 * Returns the per-skill XP to grant — this is what makes `branchTotal` gates
 * reachable, and makes a team more than a single number.
 */
export function branchShareXp(
  p: PlayerState,
  branchOf: Record<string, string>,
  amount: number,
  slots = 2
): Record<string, number> {
  const main = p.mainSkillId;
  if (!main || amount <= 0) return {};
  const branch = branchOf[main];
  if (!branch) return {};
  const cap = p.skills[main]?.level ?? 0;
  if (cap <= 0) return {};

  const candidates = Object.entries(p.skills)
    .filter(([id]) => id !== main && branchOf[id] === branch)
    .sort((a, b) => a[1].level - b[1].level); // weakest sibling first

  const out: Record<string, number> = {};
  let budget = slots;
  for (const [id, lvl] of candidates) {
    if (budget <= 0) break;
    if (lvl.level >= cap) continue;
    out[id] = Math.min(amount, cap - lvl.level); // never leapfrog the main skill
    budget--;
  }
  return out;
}

/**
 * Housing level is part of the "career index" for rent pressure.
 */
export function housingCostOf(level: number): number {
  return HOUSING_COSTS[level] ?? 0;
}

/**
 * Daily living costs — food, commute, subscriptions (section 5.6 of the ТЗ,
 * which until now existed only as unused constants).
 *
 * The cost grows with income (lifestyle inflation) and with housing level, and
 * collapses to a "lag" mode when the player is broke — the game never kills the
 * player by arithmetic, it only makes them hungry.
 */
export function dailyLivingCost(
  p: PlayerState,
  living: LivingCosts,
  opts: { subscriptionsMonthly?: number } = {}
): { amount: number; broke: boolean; parts: Record<string, number> } {
  const food = Math.max(0, living.foodBase ?? 350);
  const lifestyle = Math.max(0, living.perCareerIndex ?? 0) * careerLevelIndex(p.grade);
  const housingExtra = Math.max(0, living.perHousingLevel ?? 0) * (p.housingLevel ?? 0);
  const subs = Math.round(((opts.subscriptionsMonthly ?? 0) + (living.subscriptionsMonthly ?? 0)) / 30);

  let amount = food + lifestyle + housingExtra + subs;
  if (living.lifestyleRefundMultiplier) {
    amount -= Math.round((p.items?.length ?? 0) * living.lifestyleRefundMultiplier);
  }
  amount = Math.max(0, Math.round(amount));

  if (p.money < food * 3) {
    // "лапша и гречка": survival mode, no lifestyle, no subscriptions
    return { amount: Math.round(living.foodBroke ?? 180), broke: true, parts: { food: Math.round(living.foodBroke ?? 180) } };
  }

  return { amount, broke: false, parts: { food, lifestyle, housingExtra, subs } };
}

/**
 * Wealth tax (monthly): idle capital above the threshold pays for the lifestyle
 * around it. This is the money sink the ТЗ asked for (section 13.1) — it turns
 * "a number in the corner" into a reason to reinvest into items, housing,
 * the farm or a startup instead of stacking cash.
 */
export function wealthTaxMonthly(p: PlayerState, living?: LivingCosts | null): number {
  if (!living?.wealthTaxMonthly && !living?.wealthTaxRate) return 0;
  const threshold = living.wealthTaxThreshold ?? 500000;
  const flat = living.wealthTaxMonthly ?? 0;
  if (p.money <= threshold && flat <= 0) return 0;
  const rate = living.wealthTaxRate ?? 0;
  const amount = Math.round(flat + Math.max(0, p.money - threshold) * rate);
  const cap = living.wealthTaxCap && living.wealthTaxCap > 0 ? living.wealthTaxCap : Infinity;
  return Math.max(0, Math.min(cap, amount));
}

/**
 * Human-readable breakdown of the day's fixed expenses (used by /state and UI).
 */
export function dailyCostBreakdown(
  p: PlayerState,
  living: LivingCosts,
  opts: { subscriptionsMonthly?: number; rentMonthly?: number } = {}
): { daily: number; rent: number; wealthTax: number; broke: boolean } {
  const { amount, broke } = dailyLivingCost(p, living, opts);
  return {
    daily: amount,
    rent: Math.round((opts.rentMonthly ?? 0) / 30),
    wealthTax: Math.round(wealthTaxMonthly(p, living) / 30),
    broke,
  };
}
