import { t } from '../../lib/i18n';
/**
 * Career ending helpers — CTO election (P1.12) and the CTO tenure that follows.
 *
 * The CTO board election is deliberately not a promotion: a single
 * high-variance roll with a long cooldown on failure. Since В2
 * (docs/PROPOSALS-2026-09-27-endgame.md, принято 22.10.2026) winning it does
 * NOT end the run: the player becomes a sitting CTO, and the `corporate_god`
 * ending is claimed from `claim_ending` once the post has been held for
 * `balance.endings.cto.minDaysAsCto` days (`checkEndings` in shared owns that
 * rule, so the client preview and the server agree by construction).
 * The `applyAction` switch in actions.ts handles the "claim" terminal.
 */
import { ctoElectionChance, gateFor, GRADE_SALARIES, type Grade } from '@itsim/shared';
import { clamp } from '@itsim/shared';
import { balanceRng, careerGatesOf, GRADE_POSITIONS, HUMAN_REQ, StoredState } from './shared.js';
/** Fallback matches `DEFAULTS.cto.minDaysAsCto` in shared/engine/endings.ts. */
const DEFAULT_CTO_HOLD_DAYS = 60;
/** Сколько дней надо удержать кресло, чтобы финал CTO открылся. */
export function ctoHoldDays(content: any): number {
  const raw = content?.balance?.endings?.cto?.minDaysAsCto;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_CTO_HOLD_DAYS;
}
export function runCtoElection(
  state: StoredState,
  content: any
):
  | {
      message: string;
      error?: undefined;
    }
  | {
      error: string;
      message?: undefined;
    } {
  const gate = gateFor(careerGatesOf(content), 'cto');
  if (!gate) return { error: t('Путь CTO не настроен в контенте') };
  if (state.grade !== 'architect') return { error: t('CTO выбирают из архитекторов — сначала дорасти до архит') };
  if (!state.job) return { error: t('Нужна большая компания: без штата и борда выборы не имеют смысла') };
  if ((state.ctoCooldownUntilDay ?? 0) > state.currentDay) {
    return {
      error: t('Борд ещё не отошёл после прошлого раунда. Попробуй через {p0} дн.', {
        p0: state.ctoCooldownUntilDay! - state.currentDay,
      }),
    };
  }
  const { chance, qualified, missing } = ctoElectionChance(state, gate);
  if (!qualified) {
    // Фрагменты собираются через t() на месте (а не в константах модуля) —
    // подпись требований переводится под язык запроса (beta-gap).
    const human = Object.entries(missing)
      .map(([k, v]) => `${t(HUMAN_REQ[k] ?? k)}: ${v.current}/${v.needed}`)
      .join(', ');
    return { error: t('Тебя не выдвигают. Не хватает: {human}', { human: human }) };
  }
  // NB: energy cost and totalActions are handled by the /action route
  // (EXTRA_ENERGY_COSTS.cto_elect) — do not deduct them here.
  const won = balanceRng(state)() < chance;
  if (won) {
    const salaryMult = (content.companies as any[]).find((c: any) => c.id === state.job!.companyId)?.salaryMult ?? 1;
    const salary = Math.round((GRADE_SALARIES.cto * salaryMult) / 1000) * 1000;
    state.job = { ...state.job!, position: GRADE_POSITIONS.cto, grade: 'cto', salary, daysSinceLastPromotion: 0 };
    state.grade = 'cto' as Grade;
    state.reputation = clamp(state.reputation + 10, 0, 100);
    // В2 (22.10.2026): выборы больше не фиксируют `careerEnding` в день победы —
    // CTO стал должностью, а финал открывается после `endings.cto.minDaysAsCto`
    // дней в кресле. День избрания — единственное, что нужно запомнить.
    state.ctoSinceDay = state.currentDay;
    state.lastPromotionDay = state.currentDay;
    const hold = ctoHoldDays(content);
    return {
      message: t(
        '👔 Борд проголосовал за тебя (шанс был {p0}%). Ты CTO — отныне ты отвечаешь за чужие карьеры и за свой сон. Финал «Корпоративный бог» откроется, когда продержишься в кресле {hold} дн. (сейчас 0)',
        { p0: Math.round(chance * 100), hold: hold }
      ),
    };
  }
  state.ctoCooldownUntilDay = state.currentDay + (gate.electionIntervalDays ?? 60);
  state.reputation = clamp(state.reputation - 4, 0, 100);
  state.motivation = clamp(state.motivation - 10, 0, 100);
  return {
    message: t(
      '🗑 Выборы проиграны ({p0}% было). Борд выбрал «человека системы». Минус 4 репутации, минус 10 мотивации',
      { p0: Math.round(chance * 100) }
    ),
  };
}
