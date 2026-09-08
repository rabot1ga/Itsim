/**
 * Interview routes — `/api/game/interview/{start,answer,finish}`.
 *
 * The interview is a small quiz drawn from `interviewQuestions` for the
 * player's main skill + target grade. Correct answers are NOT exposed; the
 * server reveals the answer + explanation on each answer, and resolves the
 * application on `/finish`.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import {
  applySoftXp,
  applyXp,
  calculateRating,
  GRADE_SALARIES,
  interviewAnswerScore,
  interviewChance,
  interviewXpForQuestion,
  pickInterviewQuestions,
  rollInterview,
  seededRng,
  type Offer,
  type PlayerState,
} from '@itsim/shared';
import { fmtMoney, recalcMaxEnergy, respondState, sanitizeInterviewQuestion, softOpts, StoredState } from './shared.js';

export async function interviewRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/interview/start
   * Start (or resume) the interview quiz — draws 3 questions for the
   * player's main skill and grade. Correct answers are NOT exposed.
   */
  app.post('/interview/start', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const app = state.currentApplication;
    if (!app || app.status !== 'interview_scheduled') {
      return reply.status(400).send({ error: 'Собеседование не назначено' });
    }
    if (state.currentDay < app.interviewDay) {
      return reply.status(400).send({
        error: `Собеседование назначено на день ${app.interviewDay}. Приходи вовремя — а пока подтяни скиллы`,
      });
    }

    const content = getContent();

    // Resume an existing session
    if (state.interviewSession && state.interviewSession.companyId === app.companyId) {
      const questions = state.interviewSession.questions
        .map((slot) => content.interviewQuestions.find((q: any) => q.id === slot.id))
        .filter(Boolean)
        .map(sanitizeInterviewQuestion);
      return {
        questions,
        answers: state.interviewSession.questions.map((slot) => ({ id: slot.id, chosen: slot.chosen })),
        total: questions.length,
        state: respondState(state),
      };
    }

    const rng = seededRng(`${userId}:interview:${app.companyId}:${app.interviewDay}`);
    const questions = pickInterviewQuestions(content.interviewQuestions, {
      mainSkillId: state.mainSkillId,
      grade: app.grade,
      count: 3,
      rng,
    });
    if (questions.length < 3) {
      return reply.status(400).send({ error: 'Недостаточно вопросов для собеседования' });
    }

    state.interviewSession = {
      companyId: app.companyId,
      questions: questions.map((q) => ({ id: q.id, chosen: null, correct: null })),
    };
    saveState(userId, state);

    return {
      questions: questions.map(sanitizeInterviewQuestion),
      answers: [],
      total: questions.length,
      state: respondState(
        state,
        `🎤 Собеседование в «${(content.companies as any[]).find((c) => c.id === app.companyId)?.name ?? 'компании'}» началось!`
      ),
    };
  });

  /**
   * POST /api/game/interview/answer
   * Answer one question; the server checks correctness and returns
   * the explanation (learning!). Idempotent for already-answered ones.
   */
  app.post('/interview/answer', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { questionId, choiceIndex } = request.body as { questionId?: string; choiceIndex?: number };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const session = state.interviewSession;
    if (!session) return reply.status(400).send({ error: 'Собеседование не начато' });

    const content = getContent();
    const slot = session.questions.find((q) => q.id === questionId);
    const def = (content.interviewQuestions as any[]).find((q) => q.id === questionId);
    if (!slot || !def) return reply.status(404).send({ error: 'Вопрос не найден' });
    if (choiceIndex === undefined || choiceIndex < 0 || choiceIndex >= def.options.length) {
      return reply.status(400).send({ error: 'Некорректный вариант ответа' });
    }

    if (slot.chosen !== null) {
      // Idempotent: return the stored result again
      return {
        correct: slot.correct,
        correctIndex: def.correctIndex,
        explanation: def.explanation,
        state: respondState(state),
      };
    }

    const correct = choiceIndex === def.correctIndex;
    slot.chosen = choiceIndex;
    slot.correct = correct;
    saveState(userId, state);

    return {
      correct,
      correctIndex: def.correctIndex,
      explanation: def.explanation,
      state: respondState(state, correct ? '✅ Верно! Интервьюер кивает.' : '❌ Мимо. Зато теперь точно запомнишь.'),
    };
  });

  /**
   * POST /api/game/interview/finish
   * Grade the quiz, award learning XP, feed the REAL interviewChance
   * and resolve the application (offer or rejection).
   */
  app.post('/interview/finish', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const session = state.interviewSession;
    if (!session) return reply.status(400).send({ error: 'Собеседование не начато' });

    const content = getContent();
    if (session.questions.some((q) => q.chosen === null)) {
      return reply.status(400).send({ error: 'Ответь на все вопросы, чтобы завершить собеседование' });
    }

    const app = state.currentApplication;
    if (!app || app.companyId !== session.companyId) {
      state.interviewSession = undefined;
      saveState(userId, state);
      return reply.status(400).send({ error: 'Заявка не найдена или устарела' });
    }

    const total = session.questions.length;
    const correct = session.questions.filter((q) => q.correct).length;
    const answerScore = interviewAnswerScore(correct, total);

    // Gamified learning: XP for every question (right or wrong)
    const xpGains: string[] = [];
    for (const slot of session.questions) {
      const def = (content.interviewQuestions as any[]).find((q) => q.id === slot.id);
      if (!def) continue;
      const gain = interviewXpForQuestion(!!slot.correct);
      if (def.skillId === 'general') {
        const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
        state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, gain, softOpts(content)) };
        xpGains.push(`soft +${gain}`);
      } else {
        const cur = state.skills[def.skillId] ?? { level: 0, xp: 0 };
        state.skills = { ...state.skills, [def.skillId]: applyXp(cur, gain, state.motivation) };
        xpGains.push(`${def.skillId} +${gain}`);
      }
    }

    // Real interview resolution with the player's actual performance
    const company = (content.companies as any[]).find((c) => c.id === app.companyId);
    const skillLevels = Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level]));
    const chance = interviewChance({
      skills: skillLevels,
      requirements: app.requirements,
      communication: state.softSkills['communication']?.level ?? 0,
      reputation: state.reputation,
      companyBar: company?.interviewBar ?? 1,
      answerScore,
    });
    const passed = rollInterview(chance, Math.random);

    let resultMessage: string;
    if (passed) {
      const salary = Math.round((GRADE_SALARIES[app.grade] * (company?.salaryMult ?? 1)) / 1000) * 1000;
      const offer: Offer = {
        companyId: app.companyId,
        position: app.position,
        grade: app.grade,
        salary,
        requirements: app.requirements,
        expiresInDays: 5,
        interviewBar: company?.interviewBar ?? 1,
        companyToxicity: company?.toxicity ?? 0,
      };
      state.pendingOffers = [...state.pendingOffers, offer];
      app.status = 'accepted';
      app.result = 'accepted';
      resultMessage = `🎉 Собеседование пройдено (${correct}/${total})! Оффер: ${app.position}, ${fmtMoney(salary)}/мес — прими его в «Карьере»`;
    } else {
      app.status = 'rejected';
      app.result = 'rejected';
      resultMessage = `😔 Собеседование (${correct}/${total}): «мы впечатлены, но решили двигаться с другим кандидатом». Подтяни навыки и пробуй снова!`;
    }

    state.interviewSession = undefined;
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    return {
      result: passed ? 'offer' : 'rejected',
      correct,
      total,
      chance: Math.round(chance),
      xp: xpGains,
      state: respondState(state, resultMessage),
    };
  });
}
