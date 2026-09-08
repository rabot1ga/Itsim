/**
 * Day cycle — `/api/game/advance-day`, `/api/game/event-choice`, and the
 * `advanceDay` orchestrator that wraps every "next day" effect.
 *
 * The cycle is split into named blocks (motivation drift → job effects →
 * income → rent → endings → events → resets) so each can be reasoned about
 * on its own; the orchestrator is the only place all of them meet.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import {
  applyEventEffects,
  applyMotivationDrift,
  checkAchievements,
  findProject,
  gateFor,
  gateProgress,
  gateSurplus,
  GRADE_SALARIES,
  interviewChance,
  itemDailyBonuses,
  nextGateOf,
  pickEvent,
  projectComplete,
  projectDaysLeft,
  projectFailurePenalty,
  promotionChance,
  reviewInterval,
  rollInterview,
  type Application,
  type GameEvent,
  type Offer,
} from '@itsim/shared';
import { clamp } from '@itsim/shared';
import {
  branchOfMap,
  careerGatesOf,
  careerOutlook,
  costOfDay,
  eventPhaseChance,
  fmtMoney,
  GRADE_POSITIONS,
  HOUSING_COSTS,
  miningSummary,
  monthlySubscriptions,
  perkEffectSum,
  recalcMaxEnergy,
  respondState,
  resetDailyChallenge,
  rng,
  StoredState,
  softOpts,
  targetGrade,
} from './shared.js';
import { runCtoElection } from './ending.js';
import { bumpChallenge } from './_day.js';
import { calculateRating } from '@itsim/shared';
import { dailyLivingCost, wealthTaxMonthly, weeklySalary } from '@itsim/shared';

function advanceDay(state: StoredState, content: any, messages: string[]) {
  const company = state.job ? (content.companies as any[]).find((c: any) => c.id === state.job!.companyId) : null;
  const culture = company?.culture ?? null;

  // 1. Motivation drift + burnout
  const drift = applyMotivationDrift(
    state.motivation,
    state.health,
    state.job !== null,
    culture?.motivationPerDay ?? 0
  );
  let newMotivation = drift.motivation;
  const resistance = Math.min(1, perkEffectSum(state, content, 'motivationResistance'));
  if (resistance > 0 && newMotivation < state.motivation) {
    newMotivation = Math.round(state.motivation - (state.motivation - newMotivation) * (1 - resistance));
  }
  state.motivation = newMotivation;
  if (state.motivation <= 0) {
    state.burnoutDays += 1;
    if (state.burnoutDays === 3) {
      messages.push('🔥 Ты на грани выгорания. Срочно отдохни!');
    }
  } else if (state.motivation >= 50) {
    state.burnoutDays = 0;
  }

  // 2. Health drift
  state.health = clamp(state.health + (culture?.healthPerDay ?? 0), 0, 100);

  // 3. Day counter
  state.currentDay += 1;
  state.daysSinceRegistration += 1;

  // 4. Job: work day, layoff risk, warnings, promotion
  if (state.job) {
    state.job.daysWorked += 1;
    state.job.daysSinceLastPromotion += 1;

    if (state.jobWarnings >= 3) {
      messages.push(`💀 Три предупреждения — тебя уволили из ${company?.name ?? 'компании'}. Свобода!`);
      state.job = null;
    } else if (company && rng() < (company.culture?.layoffRisk ?? 0)) {
      messages.push(`📉 Сокращение в «${company.name}». Ты в списке. Рынок, держись!`);
      state.job = null;
    } else {
      // Review cadence is per-gate (minDaysInGrade) and lives inside tryPromote
      tryPromote(state, company, content, messages);
    }
  }

  // 5. Weekly salary
  if (state.job && state.currentDay % 7 === 0) {
    const salary = weeklySalary(state.job.salary);
    state.money += salary;
    messages.push(`💰 Зарплата: +${fmtMoney(salary)}`);
  }

  // 6. Monthly rent
  if (state.currentDay % 30 === 0) {
    const cost = HOUSING_COSTS[state.housingLevel] ?? 0;
    if (state.money >= cost) {
      state.money -= cost;
      messages.push(`🏠 Оплачено жильё: ${fmtMoney(cost)}`);
    } else {
      state.money = 0;
      state.motivation = clamp(state.motivation - 8, 0, 100);
      messages.push(`⚠️ Не хватило денег на жильё (${fmtMoney(cost)}). Мотивация упала. Срочно нужен доход!`);
    }
  }

  // 6a2. Savings-cushion tracking for the next housing level
  {
    const nextLevel = (state.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
    const cost = HOUSING_COSTS[nextLevel] ?? 0;
    const hdef = ((content.balance.housing ?? []) as any[]).find((h) => h.level === nextLevel) ?? {};
    const needed = cost * (hdef.saveMult ?? 5);
    if (nextLevel <= 4 && state.money >= needed) {
      state.savingsSinceDay = state.savingsSinceDay ?? state.currentDay;
    } else {
      state.savingsSinceDay = undefined;
    }
  }

  // 6b. Daily living costs (ТЗ 5.6) — food, commute, subs. Previously dead constants.
  const living = content.balance?.livingCosts;
  let livingToday = 0;
  if (living) {
    const monthlySubs = monthlySubscriptions(state, content);
    const lc = dailyLivingCost(state, living, { subscriptionsMonthly: monthlySubs });
    livingToday = lc.amount;
    if (state.money >= lc.amount) {
      state.money -= lc.amount;
    } else {
      state.money = 0;
      state.motivation = clamp(state.motivation - 2, 0, 100);
      if (state.currentDay % 10 === 0) {
        messages.push(`🍜 На еду не хватило — сегодня на гречке. Расходы: ${fmtMoney(lc.amount)}/день`);
      }
    }
    state.lastLivingCost = livingToday;

    // Wealth tax: idle capital pays for the lifestyle around it (ТЗ 13.1 money sinks)
    const tax = wealthTaxMonthly(state, living);
    if (tax > 0) {
      if (state.currentDay % 30 === 0) {
        const paid = Math.min(state.money, tax);
        state.money -= paid;
        messages.push(
          `🏦 Налог на состояние и образ жизни: −${fmtMoney(paid)}. Деньги «под матрасом» обесцениваются — реинвестируй`
        );
      }
    }
  }

  // 6c. Career endings (ТЗ «Финалы»): burnout and «ушёл из IT»
  const endings = content.balance?.endings ?? { burnoutDays: 7, brokeDaysToQuit: 15 };
  if (!state.careerEnding) {
    if (state.burnoutDays >= (endings.burnoutDays ?? 7)) {
      state.careerEnding = 'burnout';
      state.job = null;
      messages.push('🔥 Выгорание. Ты ушёл в отпуск длиной в жизнь: ноутбук в ящик, тикеты чужие. Финал: «Пчеловод»');
    } else {
      if (state.money <= 0) state.brokeDays = (state.brokeDays ?? 0) + 1;
      else state.brokeDays = 0;
      if ((state.brokeDays ?? 0) >= (endings.brokeDaysToQuit ?? 15) && !state.job) {
        state.careerEnding = 'left_it';
        messages.push('💀 15 дней без денег и без работы. Ты ушёл из IT — в деревню, за теплицы. Финал: «Ушёл из IT»');
      }
    }
  }

  // 7. Interview resolution
  const app = state.currentApplication;
  // Auto-resolve ONLY when the player skipped the interview day entirely;
  // on the interview day itself the quiz is playable from «Карьера».
  if (app && app.status === 'interview_scheduled' && state.currentDay > app.interviewDay && !state.interviewSession) {
    resolveInterview(state, app, content, messages);
  }

  // 8. Offer expiry
  for (const offer of state.pendingOffers) {
    offer.expiresInDays -= 1;
  }
  const expired = state.pendingOffers.filter((o) => o.expiresInDays <= 0);
  if (expired.length > 0) {
    state.pendingOffers = state.pendingOffers.filter((o) => o.expiresInDays > 0);
    messages.push(
      `⏳ Оффер${expired.length > 1 ? 'ы' : ''} истек${expired.length > 1 ? 'ли' : ''}: ${expired.map((o) => o.position).join(', ')}`
    );
  }

  // 8b. Mining farm (passive crypto income)
  const mining = miningSummary(state, content);
  if (mining) {
    if (mining.net >= 0) {
      state.money += mining.net;
      state.miningEarned = (state.miningEarned ?? 0) + mining.net;
      messages.push(`⛏ Ферма намайнила: +${fmtMoney(mining.net)} (электричество −${fmtMoney(mining.electricity)})`);
    } else if (state.money >= -mining.net) {
      state.money += mining.net;
      messages.push(`⛏ Курс упал: ферма ушла в минус на ${fmtMoney(-mining.net)}`);
    } else {
      state.money = 0;
      messages.push('⛏ Не хватило на электричество — ферма стояла весь день');
    }
  }

  // 8c. Daily item bonuses (pets, plants, coffee maker...)
  const dailyBonuses = itemDailyBonuses(state.items, content.items);
  if (dailyBonuses.motivation > 0) {
    state.motivation = clamp(state.motivation + dailyBonuses.motivation, 0, 100);
  }
  if (dailyBonuses.health > 0) {
    state.health = clamp(state.health + dailyBonuses.health, 0, 100);
  }

  // 8.5 Project deadline: an unfinished contract expires at the deadline day
  if (state.activeProject) {
    const def = findProject(content.projects?.projects, state.activeProject.id);
    if (!def) {
      state.activeProject = null;
    } else if (projectDaysLeft(state.activeProject, state.currentDay) < 0 && !projectComplete(def, state.activeProject)) {
      const penalty = projectFailurePenalty(def);
      state.reputation = clamp(state.reputation - penalty, 0, 100);
      state.activeProject = null;
      messages.push(`⌛ Дедлайн проекта «${def.title}» прошёл. Заказчик ушёл: −${penalty} репутации`);
    }
  }

  // 9. Daily reset
  state.freelanceDoneToday = false;
  state.sideJobDoneToday = false;
  state.petFedToday = false;
  state.networkingToday = 0;

  // Daily challenge: new assignment for the new day
  if (!state.dailyChallenge || state.dailyChallenge.day !== state.currentDay) {
    resetDailyChallenge(state, content);
  }

  // 10. Recalc
  state.maxEnergy = recalcMaxEnergy(state, content);
  state.energy = Math.min(state.maxEnergy, state.energy + Math.floor(state.maxEnergy * 0.5));
  state.ratingScore = calculateRating(state);
}

/**
 * Promotion review. Requirements open the review; the org budget decides.
 *
 * Before v2.1 this was `if (meets requirements) promote()` on a 7-day timer, so a
 * grinding player swept the whole ladder (simulator: 100% architects). Now:
 *   - gates are content-driven and check MAIN-skill depth + branch + breadth + soft skills
 *   - higher grades are reviewed rarer (minDaysInGrade)
 *   - a qualified candidate still competes for the slot (competition), so waiting
 *     is real and over-qualifying is what actually speeds you up
 */
function tryPromote(state: StoredState, company: any, content: any, messages: string[]) {
  const gates = careerGatesOf(content);
  const gate = nextGateOf(gates, state.job!.grade);
  if (!gate) return; // CTO is not a promotion — it is an election

  if ((state.job!.daysSinceLastPromotion ?? 0) < reviewInterval(gates, state.job!.grade)) return;

  const progress = gateProgress(state, gate, { branchOf: branchOfMap(content) });
  if (!progress.ok) return;

  const surplus = gateSurplus(progress);
  if (!promotionChance(surplus, gate.competition ?? 1, rng)) {
    // No spam: tell the player only on the day the review happened
    messages.push(`📋 Ревью на ${gate.label ?? gate.grade}: место пока занято. Ты у уреза — качай глубину, не ширину`);
    return;
  }

  const salaryMult = company?.salaryMult ?? 1;
  const newSalary = Math.round((GRADE_SALARIES[gate.grade] * salaryMult) / 1000) * 1000;
  state.job = {
    ...state.job!,
    position: GRADE_POSITIONS[gate.grade],
    grade: gate.grade,
    salary: newSalary,
    daysSinceLastPromotion: 0,
  };
  state.grade = gate.grade;
  state.lastPromotionDay = state.currentDay;
  state.reputation = clamp(state.reputation + 3, 0, 100);
  messages.push(
    `🚀 Повышение! Теперь ты ${GRADE_POSITIONS[gate.grade]} (${fmtMoney(newSalary)}/мес). Поздравляем, тебя ждёт ещё больше созвонов`
  );
}

function resolveInterview(state: StoredState, app: Application, content: any, messages: string[]) {
  const company = (content.companies as any[]).find((c: any) => c.id === app.companyId);
  if (!company) {
    state.currentApplication = null;
    return;
  }

  const skillLevels = Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level]));
  const communication = state.softSkills['communication']?.level ?? 0;
  const answerScore = 0.6 + rng() * 0.4; // mini-game result, 0.6..1.0

  const chance = interviewChance({
    skills: skillLevels,
    requirements: app.requirements,
    communication,
    reputation: state.reputation,
    companyBar: company.interviewBar ?? 1,
    answerScore,
  });

  const passed = rollInterview(chance, rng);

  if (passed) {
    const salary = Math.round((GRADE_SALARIES[app.grade] * (company.salaryMult ?? 1)) / 1000) * 1000;
    const offer: Offer = {
      companyId: company.id,
      position: app.position,
      grade: app.grade,
      salary,
      requirements: app.requirements,
      expiresInDays: 5,
      interviewBar: company.interviewBar ?? 1,
      companyToxicity: company.toxicity ?? 0,
    };
    state.pendingOffers = [...state.pendingOffers, offer];
    app.status = 'accepted';
    app.result = 'accepted';
    messages.push(
      `🎉 Собеседование в «${company.name}» пройдено! Оффер: ${app.position}, ${fmtMoney(salary)}/мес. Действует 5 дней — принять в «Карьере»`
    );
  } else {
    app.status = 'rejected';
    app.result = 'rejected';
    messages.push(
      `😔 «${company.name}»: мы впечатлены вашим резюме, но решили двигаться с другим кандидатом. Не расстраивайся — попробуй ещё раз через пару дней`
    );
  }
}

function maybeTriggerEvent(state: StoredState, content: any): GameEvent | null {
  // An unresolved event (action-triggered or chain) stays until resolved
  if (state.activeEventId) return null;

  // Pending chain events have absolute priority
  const dueIndex = state.pendingEvents.findIndex((e) => e.triggerDay <= state.currentDay);
  if (dueIndex >= 0) {
    const [due] = state.pendingEvents.splice(dueIndex, 1);
    const event = (content.events as any[]).find((e) => e.id === due.eventId);
    if (event) {
      state.activeEventId = event.id;
      return event;
    }
  }

  // Random event roll
  const chance = eventPhaseChance(content.balance, state.currentDay);
  if (rng() < chance) {
    const event = pickEvent(state, content.events, rng);
    if (event) {
      state.activeEventId = event.id;
      return event;
    }
  }

  return null;
}

export async function dayRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/advance-day — end current day, apply daily effects
   */
  app.post('/advance-day', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);

    const state = loadState(userId) as StoredState | null;
    if (!state) {
      return { error: 'Game not started' };
    }

    const messages: string[] = [];
    const content = getContent();

    advanceDay(state, content, messages);

    // Event roll
    const event = maybeTriggerEvent(state, content);
    if (event) {
      messages.push(`📢 ${event.title}`);
    }

    // Achievements
    const earned = checkAchievements(state, content.achievements);
    for (const a of earned) {
      messages.push(`🏆 Достижение: ${a.icon} ${a.name} — ${a.description}`);
    }

    saveState(userId, state);

    return {
      state: respondState(state, messages.length > 0 ? messages.join('\n') : undefined),
      messages,
      activeEvent: event,
      mining: miningSummary(state, content),
      careerOutlook: careerOutlook(state, content),
      costOfDay: costOfDay(state, content),
    };
  });

  /**
   * POST /api/game/event-choice — resolve an event choice
   */
  app.post('/event-choice', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { eventId, choiceIndex } = request.body as { eventId?: string; choiceIndex?: number };

    const state = loadState(userId) as StoredState | null;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    if (!eventId || choiceIndex === undefined) {
      return reply.status(400).send({ error: 'eventId and choiceIndex required' });
    }
    if (state.activeEventId !== eventId) {
      return reply.status(400).send({ error: 'Это событие уже не активно' });
    }

    const content = getContent();
    const event = content.events.find((e: any) => e.id === eventId);
    if (!event) return reply.status(404).send({ error: 'Событие не найдено' });

    const choice = event.choices[choiceIndex];
    if (!choice) return reply.status(400).send({ error: 'Некорректный выбор' });

    // Requirement gates (energy/money/skills/relations)
    const req = choice.requires;
    if (req) {
      if (req.energy && state.energy < req.energy) {
        return reply.status(400).send({ error: 'Не хватает энергии для этого выбора' });
      }
      if (req.money && state.money < req.money) {
        return reply.status(400).send({ error: 'Не хватает денег для этого выбора' });
      }
      if (req.skill) {
        for (const [skillId, level] of Object.entries(req.skill as Record<string, number>)) {
          if ((state.skills[skillId]?.level ?? 0) < level) {
            return reply.status(400).send({ error: 'Недостаточно навыков для этого выбора' });
          }
        }
      }
      if (req.minRelation) {
        for (const [npcId, rel] of Object.entries(req.minRelation as Record<string, number>)) {
          if ((state.relationships[npcId] ?? 0) < rel) {
            return reply.status(400).send({ error: 'Отношения недостаточно хорошие для этого выбора' });
          }
        }
      }
    }

    // Apply effects (returns a new state object)
    const updated = applyEventEffects(state, choice);
    Object.assign(state, updated);

    // Event bookkeeping
    const hist = state.eventHistory[eventId] ?? { lastDay: 0, count: 0 };
    state.eventHistory = { ...state.eventHistory, [eventId]: { lastDay: state.currentDay, count: hist.count + 1 } };
    state.recentEventTags = [...state.recentEventTags, ...(event.tags ?? [])].slice(-6);
    state.activeEventId = null;

    // Chain events
    if (choice.chain && rng() < (choice.chain.chance ?? 1)) {
      state.pendingEvents = [
        ...state.pendingEvents.filter((e) => e.eventId !== choice.chain!.eventId),
        { eventId: choice.chain!.eventId, triggerDay: state.currentDay + choice.chain!.afterDays },
      ];
    }

    const earned = checkAchievements(state, content.achievements);
    const followup = choice.followup ?? '';
    const extra = earned.map((a) => `🏆 Достижение: ${a.icon} ${a.name}`).join('\n');
    const message = [followup, extra].filter(Boolean).join('\n') || undefined;

    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    return {
      state: respondState(state, message),
      followup,
      activeEvent: null,
      achievements: earned,
    };
  });
}
