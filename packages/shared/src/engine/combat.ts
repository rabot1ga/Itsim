/**
 * Бои (DESIGN-PUNCH §3): автобатл с читаемым логом.
 *
 * Закон 2: «билд решает бой» — исход задают треугольник статов, стиль и
 * перки ДО старта; сам бой детерминирован сидом (`rng` снаружи) и разворачивается
 * в лог раундов, который игрок читает как кино.
 */

export type CombatStyle = 'bear' | 'tiger' | 'wind';

export interface Fighter {
  name: string;
  power: number;
  agility: number;
  speed: number;
  style: CombatStyle;
  perks: string[];
}

export interface FightRound {
  round: number;
  attacker: 'a' | 'b';
  kind: 'hit' | 'crit' | 'dodge' | 'perk';
  damage: number;
  hpA: number;
  hpB: number;
}

export interface FightResult {
  winner: 'a' | 'b';
  rounds: FightRound[];
  hpLeft: number;
  hpMax: number;
}

/** Стили (§3): каждый крутит свой угол треугольника. */
export const STYLES: Record<CombatStyle, { label: string; power: number; agility: number; speed: number }> = {
  bear: { label: 'Медведь', power: 1.2, agility: 0.9, speed: 0.95 },
  tiger: { label: 'Тигр', power: 1.0, agility: 1.2, speed: 1.05 },
  wind: { label: 'Ветер', power: 0.95, agility: 1.05, speed: 1.25 },
};

/** Перки-деревья (§3): открываются статом и деньгами. */
export const STYLE_PERKS: Record<
  string,
  { style: CombatStyle; label: string; cost: number; stat: 'power' | 'agility' | 'speed'; need: number }
> = {
  bear_hp: { style: 'bear', label: 'Жёсткий подбородок', cost: 3000, stat: 'power', need: 15 },
  bear_finish: { style: 'bear', label: 'Добивание', cost: 6000, stat: 'power', need: 30 },
  tiger_dodge: { style: 'tiger', label: 'Уход в тень', cost: 3000, stat: 'agility', need: 15 },
  tiger_crit: { style: 'tiger', label: 'Точный удар', cost: 6000, stat: 'agility', need: 30 },
  wind_first: { style: 'wind', label: 'Первый рывок', cost: 3000, stat: 'speed', need: 15 },
  wind_combo: { style: 'wind', label: 'Двойной темп', cost: 6000, stat: 'speed', need: 30 },
};

const MAX_ROUNDS = 30;

function has(f: Fighter, perk: string): boolean {
  return f.perks.includes(perk);
}

/** HP бойца: база + сила; «Жёсткий подбородок» добавляет запас. */
export function fighterHp(f: Fighter): number {
  return 60 + Math.round(f.power * 2) + (has(f, 'bear_hp') ? 20 : 0);
}

function effStat(f: Fighter, key: 'power' | 'agility' | 'speed'): number {
  return f[key] * STYLES[f.style][key];
}

/** Шанс уклонения: ловкость защитника против скорости атакующего. */
export function dodgeChance(att: Fighter, def: Fighter): number {
  const base = 0.08 + (effStat(def, 'agility') - effStat(att, 'speed')) * 0.006;
  return Math.min(0.45, Math.max(0.03, base + (has(def, 'tiger_dodge') ? 0.08 : 0)));
}

/** Шанс крита: ловкость атакующего против ловкости защитника. */
export function critChance(att: Fighter, def: Fighter): number {
  const base = 0.05 + (effStat(att, 'agility') - effStat(def, 'agility')) * 0.005;
  return Math.min(0.35, Math.max(0.02, base + (has(att, 'tiger_crit') ? 0.1 : 0)));
}

function hitDamage(att: Fighter, def: Fighter, hpDefLeft: number, hpDefMax: number): number {
  const raw = 4 + effStat(att, 'power') * 0.6 - effStat(def, 'agility') * 0.15;
  let dmg = Math.max(1, Math.round(raw));
  // «Добивание»: добит раненого вдвое больнее
  if (has(att, 'bear_finish') && hpDefLeft / hpDefMax < 0.3) dmg = Math.round(dmg * 1.5);
  return dmg;
}

/**
 * Автобатл: атакуют по очереди, первым — кто быстрее («Первый рывок» гарантирует
 * первый ход). Уклонения/криты/перки пишутся в лог. Сид задаёт `rng`.
 */
export function runFight(a: Fighter, b: Fighter, rng: () => number): FightResult {
  let hpA = fighterHp(a);
  let hpB = fighterHp(b);
  const hpAMax = hpA;
  const hpBMax = hpB;
  const rounds: FightRound[] = [];

  // «Первый рывок»: ветер всегда начинает
  const speedA = effStat(a, 'speed') + (has(a, 'wind_first') ? 100 : 0);
  const speedB = effStat(b, 'speed') + (has(b, 'wind_first') ? 100 : 0);
  let aTurn = speedA === speedB ? rng() < 0.5 : speedA > speedB;

  for (let round = 1; round <= MAX_ROUNDS && hpA > 0 && hpB > 0; round++) {
    const att = aTurn ? a : b;
    const def = aTurn ? b : a;
    const attacks = has(att, 'wind_combo') && round % 3 === 0 ? 2 : 1;
    for (let swing = 0; swing < attacks && hpA > 0 && hpB > 0; swing++) {
      const dodged = rng() < dodgeChance(att, def);
      if (dodged) {
        rounds.push({
          round,
          attacker: aTurn ? 'a' : 'b',
          kind: 'dodge',
          damage: 0,
          hpA,
          hpB,
        });
        continue;
      }
      const crit = rng() < critChance(att, def);
      let dmg = hitDamage(att, def, aTurn ? hpB : hpA, aTurn ? hpBMax : hpAMax);
      if (crit) dmg = Math.round(dmg * 1.8);
      if (aTurn) hpB = Math.max(0, hpB - dmg);
      else hpA = Math.max(0, hpA - dmg);
      rounds.push({
        round,
        attacker: aTurn ? 'a' : 'b',
        kind: crit ? 'crit' : 'hit',
        damage: dmg,
        hpA,
        hpB,
      });
    }
    aTurn = !aTurn;
  }

  // Таймаут: победа — у кого больший процент HP
  const winner: 'a' | 'b' = hpB <= 0 ? 'a' : hpA <= 0 ? 'b' : hpA / hpAMax >= hpB / hpBMax ? 'a' : 'b';
  return { winner, rounds, hpLeft: winner === 'a' ? hpA : hpB, hpMax: winner === 'a' ? hpAMax : hpBMax };
}

/** Оценка шансов до боя (читаемая «как на что похоже» — не точная формула). */
export function winOdds(a: Fighter, b: Fighter): number {
  const score = (f: Fighter) => effStat(f, 'power') + effStat(f, 'agility') + effStat(f, 'speed') + fighterHp(f) * 0.25;
  const sa = score(a);
  const sb = score(b);
  return Math.round((sa / (sa + sb)) * 100);
}
