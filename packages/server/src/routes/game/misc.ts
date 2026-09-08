/**
 * One-off routes that don't fit a clear domain:
 *   - `/unlock-perk`  — gates perks behind their content-driven requirements
 *   - `/main-skill`   — sets the skill that study/work actions train
 *   - `/new-life`     — prestige reset (P1.1)
 *   - `/reset`        — start over (dev convenience)
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import {
  canLearnSkill,
  canUnlockPerk,
  buildNewLife,
  calculateRating,
  canStartNewLife,
  createNewPlayer,
  metaXpMult,
} from '@itsim/shared';
import { deriveGenetics, recalcMaxEnergy, respondState, resetDailyChallenge, StoredState } from './shared.js';

function describePerkRequires(requires: Record<string, number>, content: any): string {
  const skillName = (id: string) => (content.skills as any[]).find((s) => s.id === id)?.name ?? id;
  const softNames: Record<string, string> = {
    communication: 'Коммуникация',
    english: 'Английский',
    time_management: 'Тайм-менеджмент',
    leadership: 'Лидерство',
    stress_resistance: 'Стрессоустойчивость',
    public_speaking: 'Выступления',
  };
  const branchNames: Record<string, string> = {
    frontend: 'Frontend',
    backend: 'Backend',
    mobile: 'Mobile',
    qa: 'QA',
    devops: 'DevOps',
    ai_ml: 'AI/ML',
    cybersec: 'Кибербез',
    gamedev: 'GameDev',
    blockchain: 'Blockchain',
  };
  return Object.entries(requires)
    .map(([key, lvl]) => {
      if (key.endsWith('Branch')) {
        const branch = key.replace('Branch', '');
        return `${branchNames[branch] ?? branch}: ${lvl}`;
      }
      if (softNames[key]) return `${softNames[key]}: ${lvl}`;
      return `${skillName(key)}: ${lvl}`;
    })
    .join(', ');
}

export async function miscRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/unlock-perk
   * Unlock a perk when its requirements are met
   */
  app.post('/unlock-perk', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { perkId } = request.body as { perkId?: string };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const content = getContent();
    const perk = (content.perks as any[]).find((p) => p.id === perkId);
    if (!perk) return reply.status(404).send({ error: 'Перк не найден' });
    if (state.perks.includes(perk.id)) {
      return reply.status(400).send({ error: 'Перк уже открыт' });
    }

    // branchOf map from content so branch requirements work for any branch
    const branchOf: Record<string, string> = {};
    for (const skill of content.skills as any[]) {
      branchOf[skill.id] = skill.branch;
    }

    if (!canUnlockPerk(state, perk.requires, branchOf)) {
      return reply
        .status(400)
        .send({ error: `Не выполнены требования: ${describePerkRequires(perk.requires, content)}` });
    }

    state.perks = [...state.perks, perk.id];
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    return { state: respondState(state, `✨ Перк открыт: ${perk.name} — ${perk.flavor}`) };
  });

  /**
   * POST /api/game/main-skill
   * Set the skill that study/work actions train
   */
  app.post('/main-skill', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { skillId } = request.body as { skillId?: string };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const content = getContent();
    const skill = (content.skills as any[]).find((s) => s.id === skillId);
    if (!skill) return reply.status(404).send({ error: 'Навык не найден' });
    if (!canLearnSkill(state, skill)) {
      const parentReq = Object.entries(skill.unlockAt ?? {})
        .map(([pid, lvl]) => `${pid} ${lvl}+`)
        .join(', ');
      return reply.status(400).send({ error: `Навык «${skill.name}» заблокирован. Нужно: ${parentReq}` });
    }

    state.mainSkillId = skill.id;
    saveState(userId, state);
    return { state: respondState(state, `🎯 Основной навык: ${skill.name}`) };
  });

  /**
   * POST /api/game/new-life — prestige reset (P1.1).
   *
   * Available after a career ending: the career restarts from day 1 while the
   * meta ledger (lives/memories/best grade/deepest day), achievements, Stars
   * entitlements and the real-world check-in streak survive. Each finished
   * life stacks a permanent +15% XP (cap +75%) — see shared/engine/meta.ts.
   */
  app.post('/new-life', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }
    if (!canStartNewLife(state)) {
      return reply
        .status(400)
        .send({ error: 'Новая жизнь открывается после финала карьеры: CTO, выгорание или уход из IT' });
    }

    const next = {
      ...buildNewLife(state),
      telegramId: userId,
      lastTickAt: Date.now(),
      ratingScore: 0,
      activeEventId: null,
      freelanceDoneToday: false,
      lastFreelanceDay: 0,
      sideJobDoneToday: false,
      petFedToday: false,
      networkingToday: 0,
      firstName: state.firstName,
      mainSkillId: 'javascript',
    } as StoredState;
    deriveGenetics(next);
    resetDailyChallenge(next, getContent());
    next.maxEnergy = recalcMaxEnergy(next, getContent());
    saveState(userId, next);

    const lives = next.meta?.lives ?? 1;
    const pct = Math.round((metaXpMult(next.meta) - 1) * 100);
    return {
      state: respondState(
        next,
        pct > 0
          ? `♻ Жизнь ${lives} началась с чистого листа. Ачивки и покупки с тобой — и навсегда +${pct}% к XP.`
          : `♻ Жизнь ${lives} началась с чистого листа.`
      ),
      activeEvent: null,
    };
  });

  /**
   * POST /api/game/reset — start over (dev convenience)
   */
  app.post('/reset', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = {
      ...createNewPlayer(),
      telegramId: userId,
      lastTickAt: Date.now(),
      ratingScore: 0,
      activeEventId: null,
      freelanceDoneToday: false,
      lastFreelanceDay: 0,
      sideJobDoneToday: false,
      petFedToday: false,
      networkingToday: 0,
      firstName: user.first_name || 'Игрок',
      mainSkillId: 'javascript',
    } as StoredState;
    deriveGenetics(state);
    resetDailyChallenge(state, getContent());
    saveState(userId, state);
    return { state: respondState(state, 'Новая жизнь началась! 💻'), activeEvent: null };
  });
}
