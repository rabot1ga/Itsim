/**
 * Career ending helpers — CTO election (P1.12).
 *
 * The CTO board election is deliberately not a promotion: a single
 * high-variance roll with a long cooldown on failure. The `applyAction`
 * switch in actions.ts handles the "claim" terminal via the `claim_ending`
 * action; here we own the "kick off the election" logic.
 */
import { calculateRating, ctoElectionChance, gateFor, GRADE_SALARIES, type Grade } from '@itsim/shared';
import { clamp } from '@itsim/shared';
import { careerGatesOf, fmtMoney, GRADE_POSITIONS, HUMAN_REQ, rng, StoredState } from './shared.js';

export function runCtoElection(
  state: StoredState,
  content: any
): { message: string; error?: undefined } | { error: string; message?: undefined } {
  const gate = gateFor(careerGatesOf(content), 'cto');
  if (!gate) return { error: 'Путь CTO не настроен в контенте' };
  if (state.grade !== 'architect') return { error: 'CTO выбирают из архитекторов — сначала дорасти до архит' };
  if (!state.job) return { error: 'Нужна большая компания: без штата и борда выборы не имеют смысла' };
  if ((state.ctoCooldownUntilDay ?? 0) > state.currentDay) {
    return {
      error: `Борд ещё не отошёл после прошлого раунда. Попробуй через ${state.ctoCooldownUntilDay! - state.currentDay} дн.`,
    };
  }

  const { chance, qualified, missing } = ctoElectionChance(state, gate);
  if (!qualified) {
    const human = Object.entries(missing)
      .map(([k, v]) => `${HUMAN_REQ[k] ?? k}: ${v.current}/${v.needed}`)
      .join(', ');
    return { error: `Тебя не выдвигают. Не хватает: ${human}` };
  }

  // NB: energy cost and totalActions are handled by the /action route
  // (EXTRA_ENERGY_COSTS.cto_elect) — do not deduct them here.
  const won = rng() < chance;
  if (won) {
    const salaryMult = (content.companies as any[]).find((c: any) => c.id === state.job!.companyId)?.salaryMult ?? 1;
    const salary = Math.round((GRADE_SALARIES.cto * salaryMult) / 1000) * 1000;
    state.job = { ...state.job!, position: GRADE_POSITIONS.cto, grade: 'cto', salary, daysSinceLastPromotion: 0 };
    state.grade = 'cto' as Grade;
    state.reputation = clamp(state.reputation + 10, 0, 100);
    state.careerEnding = 'corporate_god';
    state.lastPromotionDay = state.currentDay;
    return {
      message: `👔 Борд проголосовал за тебя (шанс был ${Math.round(chance * 100)}%). Ты CTO — отныне ты отвечаешь за чужие карьеры и за свой сон`,
    };
  }
  state.ctoCooldownUntilDay = state.currentDay + (gate.electionIntervalDays ?? 60);
  state.reputation = clamp(state.reputation - 4, 0, 100);
  state.motivation = clamp(state.motivation - 10, 0, 100);
  return {
    message: `🗑 Выборы проиграны (${Math.round(chance * 100)}% было). Борд выбрал «человека системы». Минус 4 репутации, минус 10 мотивации`,
  };
}
