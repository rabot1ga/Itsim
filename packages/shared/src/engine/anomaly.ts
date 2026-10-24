/**
 * Детекция аномалий (античит сверх rate limit, README «Геймплей и баланс»).
 *
 * Сервер авторитетен (сейв и RNG живут на сервере), поэтому «невозможные»
 * состояния — это следы багов или эксплуатации: жёсткие инварианты
 * выравниваются (clamp), а подозрительные скачки между сохранениями
 * фиксируются как сигнал (см. `detectDeltaAnomalies`). Решение о бане/ревью
 * принимает человек — автоматических наказаний нет.
 */
import { theoreticalMaxRatingXp } from './rating.js';

export interface Anomaly {
  code: string;
  detail: string;
}

interface AnomalyState {
  energy?: number;
  maxEnergy?: number;
  health?: number;
  motivation?: number;
  currentDay?: number;
  money?: number;
  skills?: Record<string, { level?: number; xp?: number }>;
}

/**
 * Жёсткие инварианты сейва: выравнивает значения в допустимых границах и
 * возвращает список того, что было исправлено (пусто — состояние в норме).
 */
export function clampStateAnomalies(state: AnomalyState): Anomaly[] {
  const out: Anomaly[] = [];
  const clamp = (code: string, field: string, value: number, lo: number, hi: number): number => {
    if (!Number.isFinite(value)) {
      out.push({ code, detail: `${field}=${value} is not a finite number` });
      return lo;
    }
    if (value < lo || value > hi) {
      out.push({ code, detail: `${field}=${value} outside [${lo}, ${hi}]` });
      return Math.min(hi, Math.max(lo, value));
    }
    return value;
  };
  const maxEnergy = Number.isFinite(state.maxEnergy) ? Math.max(1, Math.min(100, state.maxEnergy as number)) : 10;
  if (state.maxEnergy !== undefined && state.maxEnergy !== maxEnergy) {
    out.push({ code: 'energy_out_of_range', detail: `maxEnergy=${state.maxEnergy} normalized to ${maxEnergy}` });
    state.maxEnergy = maxEnergy;
  }
  if (state.energy !== undefined) state.energy = clamp('energy_out_of_range', 'energy', state.energy, 0, maxEnergy);
  if (state.health !== undefined) state.health = clamp('stats_out_of_range', 'health', state.health, 0, 100);
  if (state.motivation !== undefined) {
    state.motivation = clamp('stats_out_of_range', 'motivation', state.motivation, 0, 100);
  }
  if (state.currentDay !== undefined) {
    state.currentDay = clamp('day_regression', 'currentDay', state.currentDay, 1, 100_000);
  }
  for (const [id, skill] of Object.entries(state.skills ?? {})) {
    if (!skill || typeof skill !== 'object') continue;
    if (skill.level !== undefined)
      skill.level = clamp('skills_out_of_range', `skills.${id}.level`, skill.level, 0, 100);
    if (skill.xp !== undefined) skill.xp = clamp('skills_out_of_range', `skills.${id}.xp`, skill.xp, 0, 1e9);
  }
  return out;
}

/**
 * Сигналы между двумя сохранениями одного игрока: скачки, которые игровой
 * процесс не объясняет. Только фиксируем — не наказываем.
 */
export function detectDeltaAnomalies(prev: AnomalyState | undefined, next: AnomalyState): Anomaly[] {
  if (!prev) return [];
  const out: Anomaly[] = [];
  const prevDay = prev.currentDay ?? 1;
  const nextDay = next.currentDay ?? 1;
  const dayDelta = nextDay - prevDay;
  // Банк дней даёт до +8 за запрос (7 накопленных + обычный); больше — мимо игры.
  if (dayDelta > 8) {
    out.push({ code: 'day_jump', detail: `currentDay ${prevDay} -> ${nextDay} in one save` });
  }
  const moneyDelta = (next.money ?? 0) - (prev.money ?? 0);
  // Потолок честного дневного дохода с запасом: мгновенный миллиард — баг или манипуляция.
  if (moneyDelta > 1_000_000_000) {
    out.push({ code: 'money_jump', detail: `money +${moneyDelta} in one save` });
  }
  // XP-бюджет дня (theoreticalMaxRatingXp): рост суммарного опыта навыков
  // сверх бюджета на пройденные дни — сигнал, не вердикт.
  const prevXp = skillXpTotal(prev);
  const nextXp = skillXpTotal(next);
  const budget = theoreticalMaxRatingXp(Math.max(1, nextDay)) + 250_000; // стартовый запас миграций
  if (nextXp - prevXp > budget) {
    out.push({ code: 'xp_jump', detail: `skill xp +${nextXp - prevXp} above day budget ${budget}` });
  }
  return out;
}

function skillXpTotal(state: AnomalyState): number {
  return Object.values(state.skills ?? {}).reduce((sum, s) => sum + (s?.level ?? 0) * 10_000 + (s?.xp ?? 0), 0);
}
