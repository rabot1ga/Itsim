/**
 * GET /api/game/state — current state + offline energy banking.
 *
 * Extracted from game.ts in P1.14. Composes the "what the client renders on
 * first paint" payload: state + check-in + sprint + active event + mining
 * summary + career outlook + cost-of-day.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import {
  advanceLastTick,
  applyCheckIn,
  calculateOfflineBankedDays,
  checkInReward,
  createNewPlayer,
  gameDate,
  rollSprint,
  type GameEvent,
} from '@itsim/shared';
import { getNftProvider } from '../../services/nftProvider.js';
import {
  careerOutlook,
  costOfDay,
  deriveGenetics,
  miningSummary,
  recalcMaxEnergy,
  resetDailyChallenge,
  respondState,
  sprintView,
  StoredState,
} from './shared.js';
import { calculateRating } from '@itsim/shared';

export async function stateRoutes(app: FastifyInstance) {
  app.get('/state', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    let state = loadState(userId) as StoredState | null;
    const isNew = !state;
    if (!state) {
      state = {
        ...createNewPlayer(),
        telegramId: userId,
        lastTickAt: Date.now(),
        ratingScore: 0,
        activeEventId: null,
        freelanceDoneToday: false,
        freelanceBid: null,
        lastFreelanceDay: 0,
        sideJobDoneToday: false,
        petFedToday: false,
        firstName: user.first_name || 'Игрок',
        mainSkillId: 'javascript',
      } as StoredState;
      deriveGenetics(state);
      resetDailyChallenge(state, getContent());
    }

    // Refresh cross-collection bonuses (DESIGN.md 3.3)
    state.crossBonuses = [];
    for (const col of await getNftProvider().getActiveBonuses(state.walletAddress ?? `local:${userId}`)) {
      state.crossBonuses.push(...col.bonuses);
    }

    // Offline energy banking (1 game day / 3.5 real hours, max 7 in bank)
    const banked = calculateOfflineBankedDays(state.lastTickAt, Date.now());
    if (banked > 0) {
      state.bankedDays = Math.min(7, state.bankedDays + banked);
      state.lastTickAt = advanceLastTick(state.lastTickAt, banked);
    }

    state.maxEnergy = recalcMaxEnergy(state, getContent());
    state.ratingScore = calculateRating(state);

    // Daily check-in (retention hook): once per real game-day, a money bonus
    // that grows with the streak. Applied server-side on state read, so the
    // reward lands the moment the player opens the app.
    const checkInNow = applyCheckIn(state, Date.now());
    let checkIn: { claimed: boolean; streak: number; money: number; nextMoney: number };
    if (checkInNow.claimed) {
      state.dailyStreak = checkInNow.streak;
      state.lastCheckInDate = gameDate(Date.now());
      if (checkInNow.reward.money > 0) state.money += checkInNow.reward.money;
      checkIn = {
        claimed: true,
        streak: checkInNow.streak,
        money: checkInNow.reward.money,
        nextMoney: checkInReward(checkInNow.streak + 1).money,
      };
    } else {
      const streak = Math.max(1, state.dailyStreak ?? 1);
      checkIn = { claimed: false, streak, money: 0, nextMoney: checkInReward(streak + 1).money };
    }

    // Weekly sprint (P1.2): roll the real-time week so the banner is current
    const sprintRolled = rollSprint(state.sprint, getContent().sprints?.themes, Date.now());
    if (sprintRolled) state.sprint = sprintRolled;

    // Surface pending chain events even if the user missed the day roll
    let activeEvent: GameEvent | null = null;
    if (state.activeEventId) {
      activeEvent = getContent().events.find((e: any) => e.id === state.activeEventId) ?? null;
    } else {
      const due = state.pendingEvents.find((e) => e.triggerDay <= state.currentDay);
      if (due) {
        const ev = getContent().events.find((e: any) => e.id === due.eventId);
        if (ev) {
          state.activeEventId = ev.id;
          activeEvent = ev;
        }
      }
    }

    saveState(userId, state);

    return {
      state: respondState(state, isNew ? 'Добро пожаловать в IT Life Simulator! 💻' : undefined),
      isNew,
      offlineDaysEarned: banked,
      checkIn,
      activeEvent,
      mining: miningSummary(state, getContent()),
      careerOutlook: careerOutlook(state, getContent()),
      costOfDay: costOfDay(state, getContent()),
      sprint: sprintView(state, getContent(), Date.now()),
    };
  });
}
