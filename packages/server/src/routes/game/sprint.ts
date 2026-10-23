import { t } from '../../lib/i18n';
/**
 * Weekly sprint (P1.2) — `/api/game/sprint/claim`.
 *
 * The week target banner in «День» is computed from `state.sprint` on every
 * `/state` read (see `sprintView` in shared). This file only owns the claim
 * endpoint and the helpers that live alongside it.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import { activeSprintTheme, rollSprint, sprintAllDone, sprintRewardAmounts } from '@itsim/shared';
import { clamp } from '@itsim/shared';
import { calculateRating } from '@itsim/shared';
import { fmtMoney, respondState, sprintView, StoredState } from './shared.js';
export async function sprintRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/sprint/claim — claim the weekly sprint reward (P1.2).
   *
   * Guarded three ways: a sprint must be active for the current real week,
   * every goal must be done, and the reward is claimable once per week
   * (state.sprint.claimed flips; a rolled-over week starts unclaimed but with
   * empty progress, so an old week can never be cashed late).
   */
  app.post('/sprint/claim', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }
    const content = getContent();
    const nowMs = Date.now();
    const theme = activeSprintTheme(content.sprints?.themes, nowMs);
    const sprint = rollSprint(state.sprint, content.sprints?.themes, nowMs);
    if (!theme || !sprint) {
      return reply.status(400).send({ error: t('Сейчас нет активного спринта') });
    }
    if (sprint.claimed) {
      return reply.status(400).send({ error: t('Награда этой недели уже получена') });
    }
    if (!sprintAllDone(theme, sprint)) {
      return reply.status(400).send({ error: t('Цели спринта ещё не выполнены') });
    }
    const reward = sprintRewardAmounts(theme);
    if (reward.money) state.money += reward.money;
    if (reward.motivation) state.motivation = clamp(state.motivation + reward.motivation, 0, 100);
    if (reward.reputation) state.reputation = clamp(state.reputation + reward.reputation, 0, 100);
    sprint.claimed = true;
    state.sprint = sprint;
    state.ratingScore = calculateRating(state);
    await saveState(userId, state);
    const parts: string[] = [];
    if (reward.money) parts.push(`+${fmtMoney(reward.money)}`);
    if (reward.motivation) parts.push(t('+{p0} мотивации', { p0: reward.motivation }));
    if (reward.reputation) parts.push(t('+{p0} репутации', { p0: reward.reputation }));
    return {
      state: respondState(state, t('🏁 Спринт «{p0}» закрыт: {p1}', { p0: theme.title, p1: parts.join(', ') })),
      sprint: sprintView(state, content, nowMs),
    };
  });
}
