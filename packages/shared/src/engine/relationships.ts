import { clamp } from './utils';
import type { PlayerState } from '../types';

/**
 * D1 (25.10.2026) — «отношения работают».
 *
 * Раньше `relationships` копились в никуда: 93 выбора их меняли, а ни одна
 * система их не читала. Теперь три порога дают пассивные эффекты (план
 * docs/PROPOSALS-2026-10-25-interface-events-friends.md, D1):
 *
 *   - тимлид `teamlead` ≥ 60 — заступается: продвижение идёт легче
 *     (bonus к surplus ревью) и одно предупреждение защищается;
 *   - джун `junior_colleague` (Маша) ≥ 40 — менторский XP раз в
 *     `MENTOR_EVERY_DAYS` дней: объясняя, понимаешь сам;
 *   - токсик `toxic_senior` ≤ −30 — стресс-штраф каждый день
 *     (мотивация падает, пока конфликт не улажен).
 */

/** Порог «тимлид заступается» (Алексей Петрович). */
export const TEAMLEAD_REL = 60;
/** Порог «наставничество» (Маша). */
export const MENTOR_REL = 40;
/** Порог «конфликт» (Дмитрий Борисович). */
export const TOXIC_REL = -30;
/** Раз в сколько дней Маша приносит менторский XP. */
export const MENTOR_EVERY_DAYS = 3;
/** XP за менторский эпизод (в основной навык). */
export const MENTOR_XP = 15;
/** Штраф мотивации за день конфликта с токсиком. */
export const TOXIC_MOTIVATION_HIT = 3;
/** Сколько защищает тимлид, когда заступается (минус к прибавке предупреждений). */
export const TEAMLEAD_WARNING_ABSORB = 1;
/** Сколько surplus добавляет тимлид на ревью повышения. */
export const TEAMLEAD_SURPLUS_BONUS = 2;
/** Сколько отношений даёт день «Провести время с другом». */
export const SPEND_TIME_RELATION = 8;
/** Мотивация за совместное времяпрепровождение. */
export const SPEND_TIME_MOTIVATION = 2;

type RelState = Pick<PlayerState, 'relationships'>;

function relation(state: RelState, npcId: string): number {
  return state.relationships?.[npcId] ?? 0;
}

/** Тимлид заступается? */
export function teamleadCovers(state: RelState): boolean {
  return relation(state, 'teamlead') >= TEAMLEAD_REL;
}

/** Бонус к surplus ревью повышения (0, пока тимлид не друг). */
export function teamleadSurplusBonus(state: RelState): number {
  return teamleadCovers(state) ? TEAMLEAD_SURPLUS_BONUS : 0;
}

/**
 * Тимлид гасит одно предупреждение: возвращает скорректированную прибавку
 * (не ниже нуля). Вызывается в момент выдачи предупреждения.
 */
export function absorbJobWarning(state: RelState, amount: number): number {
  if (amount <= 0) return amount;
  return teamleadCovers(state) ? Math.max(0, amount - TEAMLEAD_WARNING_ABSORB) : amount;
}

/** Маша пришла с вопросом сегодня? (раз в MENTOR_EVERY_DAYS дней) */
export function mentorXpDue(state: RelState & Pick<PlayerState, 'currentDay'>): boolean {
  if (relation(state, 'junior_colleague') < MENTOR_REL) return false;
  const day = state.currentDay ?? 1;
  return day % MENTOR_EVERY_DAYS === 0;
}

/** Конфликт с токсиком активен? (стресс-штраф каждый такой день) */
export function toxicConflictActive(state: RelState): boolean {
  return relation(state, 'toxic_senior') <= TOXIC_REL;
}

/** Уже тратил время с этим NPC сегодня? */
export function spentTimeToday(state: Pick<PlayerState, 'friendTimeDays' | 'currentDay'>, npcId: string): boolean {
  return (state.friendTimeDays ?? {})[npcId] === (state.currentDay ?? 1);
}

/** Отметить совместное времяпрепровождение (раз в день на NPC). */
export function markSpentTime(state: Pick<PlayerState, 'friendTimeDays' | 'currentDay'>, npcId: string): void {
  if (!state.friendTimeDays) state.friendTimeDays = {};
  state.friendTimeDays[npcId] = state.currentDay ?? 1;
}

/**
 * Чип-эффект для карточки друга (D1.4): что именно даёт текущий/следующий
 * порог. Пустая строка — у персонажа нет пассивных порогов, чип не показываем.
 */
export function relationEffectLabelKey(npcId: string, rel: number): string {
  switch (npcId) {
    case 'teamlead':
      if (rel >= TEAMLEAD_REL) return 'заступается: +к повышению, гасит предупреждение';
      return `друг (≥ ${TEAMLEAD_REL}) — заступается за тебя`;
    case 'junior_colleague':
      if (rel >= MENTOR_REL) return `наставник: +${MENTOR_XP} XP раз в ${MENTOR_EVERY_DAYS} дня`;
      return `наставничество (≥ ${MENTOR_REL}) — менторский XP`;
    case 'toxic_senior':
      if (rel <= TOXIC_REL) return 'конфликт: −3 мотивации каждый день';
      return `без конфликта (>${TOXIC_REL}) — без стресс-штрафов`;
    default:
      return '';
  }
}

/** Кламп отношения после изменения (общий для событий и действий). */
export function clampRelation(value: number): number {
  return clamp(value, -100, 100);
}
