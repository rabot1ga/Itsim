import { t } from '../../lib/i18n';
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
  applyXp,
  mentorXpDue,
  toxicConflictActive,
  teamleadSurplusBonus,
  MENTOR_XP,
  TOXIC_MOTIVATION_HIT,
  applyMotivationDrift,
  consolationPayment,
  resolveBid,
  checkAchievements,
  findProject,
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
  recordMilestones,
  startProject,
  reviewInterval,
  rollInterview,
  type Application,
  type GameEvent,
  type Offer,
} from '@itsim/shared';
import { clamp, contactsOf } from '@itsim/shared';
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
  MUTATION_RATE_LIMIT,
  perkEffectSum,
  recalcMaxEnergy,
  respondState,
  resetDailyChallenge,
  balanceRng,
  StoredState,
} from './shared.js';
import { calculateRating, type Grade } from '@itsim/shared';
import { ctoHoldDays } from './ending.js';
import { dailyLivingCost, wealthTaxMonthly, weeklySalary } from '@itsim/shared';
/**
 * Полный цикл дня. Экспортирован ради тестов: правила дня (потеря кресла CTO,
 * терминалы, ревью) — чистая функция от `state` + `content`, и проверять их
 * через HTTP означало бы поднимать сервер ради одного ассерта.
 */
export function advanceDay(state: StoredState, content: any, messages: string[]) {
  const rng = balanceRng(state);
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
      messages.push(t('Ты на грани выгорания. Срочно отдохни!'));
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
      messages.push(t('Три предупреждения — тебя уволили из {p0}. Свобода!', { p0: company?.name ?? 'компании' }));
      state.job = null;
      loseCtoSeat(state, content, messages, t('Борд не стал ждать третьего предупреждения'));
    } else if (company && rng() < (company.culture?.layoffRisk ?? 0)) {
      messages.push(t('Сокращение в «{p0}». Ты в списке. Рынок, держись!', { p0: company.name }));
      state.job = null;
      loseCtoSeat(state, content, messages, t('Сокращение дошло до верхнего этажа'));
    } else {
      // Review cadence is per-gate (minDaysInGrade) and lives inside tryPromote
      tryPromote(state, company, content, messages);
    }
  }
  // 4b. Friends (D1): пассивные эффекты порогов отношений
  if (mentorXpDue(state)) {
    const mainId = state.mainSkillId ?? Object.keys(state.skills)[0];
    const skill = state.skills[mainId];
    if (skill) {
      state.skills = { ...state.skills, [mainId]: applyXp(skill, MENTOR_XP, state.motivation) };
      messages.push(t('Маша пришла с вопросом: объясняя, разобрался сам (+{p0} XP)', { p0: MENTOR_XP }));
    }
  }
  if (toxicConflictActive(state)) {
    state.motivation = clamp(state.motivation - TOXIC_MOTIVATION_HIT, 0, 100);
    messages.push(
      t('Дмитрий Борисович опять свёл дискуссию к лекции — настроение −{p0}', { p0: TOXIC_MOTIVATION_HIT })
    );
  }
  // 5. Weekly salary
  if (state.job && state.currentDay % 7 === 0) {
    const salary = weeklySalary(state.job.salary);
    state.money += salary;
    messages.push(t('Зарплата: +{p0}', { p0: fmtMoney(salary) }));
  }
  // 6. Monthly rent
  if (state.currentDay % 30 === 0) {
    const cost = HOUSING_COSTS[state.housingLevel] ?? 0;
    if (state.money >= cost) {
      state.money -= cost;
      messages.push(t('Оплачено жильё: {p0}', { p0: fmtMoney(cost) }));
    } else {
      state.money = 0;
      state.motivation = clamp(state.motivation - 8, 0, 100);
      messages.push(
        t('Не хватило денег на жильё ({p0}). Мотивация упала. Срочно нужен доход!', { p0: fmtMoney(cost) })
      );
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
      state.hungryDays = 0;
    } else {
      // Голодный день (еда — настоящая потребность): тело страдает без еды,
      // а здоровье ограничивает мотивацию (healthCap = 40 + health*0.6) —
      // «жить на нуле» перестаёт быть бесплатным.
      state.money = 0;
      state.hungryDays = (state.hungryDays ?? 0) + 1;
      state.health = clamp(state.health - 3, 0, 100);
      state.motivation = clamp(state.motivation - 3, 0, 100);
      messages.push(
        t('На еду не хватило (нужно {p0}) — день на гречке: здоровье −3, мотивация −3', {
          p0: fmtMoney(lc.amount),
        })
      );
      if (state.hungryDays >= 3) {
        state.health = clamp(state.health - 4, 0, 100);
        messages.push(t('Уже {p0} дн. без нормальной еды: истощение, здоровье ещё −4', { p0: state.hungryDays }));
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
          t('Налог на состояние и образ жизни: −{p0}. Деньги «под матрасом» обесцениваются — реинвестируй', {
            p0: fmtMoney(paid),
          })
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
      messages.push(t('Выгорание. Ты ушёл в отпуск длиной в жизнь: ноутбук в ящик, тикеты чужие. Финал: «Пчеловод»'));
    } else {
      // «15 дней без денег и без работы»: цепочка растёт только пока держатся
      // оба условия; любая работа или деньги обрывают её. Раньше счётчик шёл и
      // с работой — финал вспыхивал в день увольнения, а сообщение врало.
      if (state.money <= 0 && !state.job) state.brokeDays = (state.brokeDays ?? 0) + 1;
      else state.brokeDays = 0;
      if ((state.brokeDays ?? 0) >= (endings.brokeDaysToQuit ?? 15) && !state.job) {
        state.careerEnding = 'left_it';
        messages.push(
          t('{p0} дней без денег и без работы. Ты ушёл из IT — в деревню, за теплицы. Финал: «Ушёл из IT»', {
            p0: endings.brokeDaysToQuit ?? 15,
          })
        );
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
      t('Оффер{p0} истек{p1}: {p2}', {
        p0: expired.length > 1 ? 'ы' : '',
        p1: expired.length > 1 ? 'ли' : '',
        p2: expired.map((o) => o.position).join(', '),
      })
    );
  }
  // 8b. Mining farm (passive crypto income)
  const mining = miningSummary(state, content);
  if (mining) {
    if (mining.net >= 0) {
      state.money += mining.net;
      state.miningEarned = (state.miningEarned ?? 0) + mining.net;
      messages.push(
        t('Ферма намайнила: +{p0} (электричество −{p1})', {
          p0: fmtMoney(mining.net),
          p1: fmtMoney(mining.electricity),
        })
      );
    } else if (state.money >= -mining.net) {
      state.money += mining.net;
      messages.push(t('Курс упал: ферма ушла в минус на {p0}', { p0: fmtMoney(-mining.net) }));
    } else {
      state.money = 0;
      messages.push(t('Не хватило на электричество — ферма стояла весь день'));
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
  // 8.4 Freelance bid: the client sleeps on it and answers in the morning
  if (state.freelanceBid) {
    const bid = state.freelanceBid;
    state.freelanceBid = null;
    const def = findProject(content.projects?.projects, bid.projectId);
    if (!def) {
      messages.push(t('Заказ сняли с биржи ещё до ответа. Бывает'));
    } else if (state.activeProject) {
      messages.push(t('«{p0}»: пока ты ждал, взялся другой проект — заказчик ушёл', { p0: def.title }));
    } else {
      const outcome = resolveBid(bid.chance, rng());
      if (outcome === 'won') {
        state.activeProject = startProject(def, state.currentDay);
        state.freelanceRejectStreak = 0;
        messages.push(
          t('Заказчик выбрал тебя: «{p0}». Дедлайн — день {p1}', {
            p0: def.title,
            p1: state.activeProject.deadlineDay,
          })
        );
      } else if (outcome === 'consolation') {
        state.freelanceRejectStreak = 0;
        const perkMult = Math.max(0, perkEffectSum(state, content, 'freelancePaymentMult') - 1);
        const pay = Math.round(consolationPayment(def) * (1 + perkMult));
        state.money += pay;
        state.freelanceEarned = (state.freelanceEarned ?? 0) + pay;
        state.freelanceLastPayment = pay;
        messages.push(
          t('«{p0}» ушёл другому, но тестовое задание оплатили: +{p1}', { p0: def.title, p1: fmtMoney(pay) })
        );
      } else {
        // F: pity — серия отказов видимо поднимает шанс следующей ставки
        const streak = Math.min(4, (state.freelanceRejectStreak ?? 0) + 1);
        state.freelanceRejectStreak = streak;
        const pity = Math.round(streak * 7);
        messages.push(
          t('«{p0}»: заказчик выбрал исполнителя опытнее. Попробуй ещё раз — следующая попытка +{p1}%', {
            p0: def.title,
            p1: pity,
          })
        );
      }
    }
  }
  // 8.5 Project deadline: an unfinished contract expires at the deadline day
  if (state.activeProject) {
    const def = findProject(content.projects?.projects, state.activeProject.id);
    if (!def) {
      state.activeProject = null;
    } else if (
      projectDaysLeft(state.activeProject, state.currentDay) < 0 &&
      !projectComplete(def, state.activeProject)
    ) {
      const penalty = projectFailurePenalty(def);
      state.reputation = clamp(state.reputation - penalty, 0, 100);
      state.activeProject = null;
      messages.push(
        t('⌛ Дедлайн проекта «{p0}» прошёл. Заказчик ушёл: −{penalty} репутации', { p0: def.title, penalty: penalty })
      );
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
 * Потеря кресла CTO (В2, 22.10.2026).
 *
 * Вызывается только после того, как `state.job` обнулён. Два следствия, без
 * которых новая модель финала ломается:
 *
 *  1. Срок в кресле обнуляется. Иначе уволенный на 3-й день «CTO» ждал бы 60
 *     дней без работы и забирал финал «Корпоративный бог», ни дня не руководя.
 *  2. Грейд возвращается на `architect`. `runCtoElection` пускает на выборы
 *     только архитекторов, поэтому оставшийся без работы «cto» не мог бы ни
 *     переизбраться, ни вырасти — тупик, которого в сейвах быть не должно
 *     (симулятор считает тупики нарушением коридора).
 *
 * Вызывается молча для всех остальных грейдов: у них нет ни срока, ни выборов.
 */
function loseCtoSeat(state: StoredState, content: any, messages: string[], reason: string) {
  if (state.grade !== 'cto') return;
  const held = typeof state.ctoSinceDay === 'number' ? Math.max(0, state.currentDay - state.ctoSinceDay) : 0;
  state.grade = 'architect' as Grade;
  delete state.ctoSinceDay;
  messages.push(
    t(
      '{reason}: кресло CTO занял кто-то другой. Ты снова архитектор (в кресле было {held} дн. из {p0}) — выборы можно пройти заново',
      { reason: reason, held: held, p0: ctoHoldDays(content) }
    )
  );
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
  const rng = balanceRng(state);
  const gates = careerGatesOf(content);
  const gate = nextGateOf(gates, state.job!.grade);
  if (!gate) return; // CTO is not a promotion — it is an election
  if ((state.job!.daysSinceLastPromotion ?? 0) < reviewInterval(gates, state.job!.grade)) return;
  const progress = gateProgress(state, gate, { branchOf: branchOfMap(content) });
  if (!progress.ok) return;
  // D1: тимлид ≥ 60 заступается — ревью проходит легче
  const surplus = gateSurplus(progress) + teamleadSurplusBonus(state);
  if (!promotionChance(surplus, gate.competition ?? 1, rng)) {
    // No spam: tell the player only on the day the review happened
    messages.push(
      t('Ревью на {p0}: место пока занято. Ты у уреза — качай глубину, не ширину', { p0: gate.label ?? gate.grade })
    );
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
    t('Повышение! Теперь ты {p0} ({p1}/мес). Поздравляем, тебя ждёт ещё больше созвонов', {
      p0: GRADE_POSITIONS[gate.grade],
      p1: fmtMoney(newSalary),
    })
  );
}
function resolveInterview(state: StoredState, app: Application, content: any, messages: string[]) {
  const rng = balanceRng(state);
  const company = (content.companies as any[]).find((c: any) => c.id === app.companyId);
  if (!company) {
    state.currentApplication = null;
    return;
  }
  const skillLevels = Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level]));
  const communication = state.softSkills['communication']?.level ?? 0;
  const answerScore = 0.4 + rng() * 0.3; // 0.4..0.7: не пришёл — так себе выступление; квиз даёт 0.4..1.0
  const chance = interviewChance({
    skills: skillLevels,
    requirements: app.requirements,
    communication,
    reputation: state.reputation,
    companyBar: company.interviewBar ?? 1,
    answerScore,
  });
  // F: pity — серия отказов поднимает шанс (потолок +28%)
  const pity = Math.min(4, state.interviewRejectStreak ?? 0) * 0.07;
  const passed = rollInterview(chance + pity, rng);
  if (passed) {
    state.interviewRejectStreak = 0;
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
      t(
        'Ты пропустил собеседование в «{p0}» — но резюме так понравилось, что прислали оффер: {p1}, {p2}/мес. Действует 5 дней — принять в «Карьере»',
        {
          p0: company.name,
          p1: app.position,
          p2: fmtMoney(salary),
        }
      )
    );
  } else {
    app.status = 'rejected';
    app.result = 'rejected';
    const streak = Math.min(4, (state.interviewRejectStreak ?? 0) + 1);
    state.interviewRejectStreak = streak;
    messages.push(
      t(
        'Ты пропустил собеседование в «{p0}» — без кандидата решили не рисковать. Попробуй ещё раз через пару дней (следующее +{p1}%)',
        {
          p0: company.name,
          p1: Math.round(streak * 7),
        }
      )
    );
  }
}
function maybeTriggerEvent(state: StoredState, content: any): GameEvent | null {
  const rng = balanceRng(state);
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
  app.post('/advance-day', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = (await loadState(userId)) as StoredState | null;
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
      messages.push(t('Достижение: {p0} {p1} — {p2}', { p0: a.icon, p1: a.name, p2: a.description }));
    }
    // Автопостинг вех: промоушен/миллион/год — пост в ленту профиля
    for (const m of recordMilestones(state, content.balance)) {
      messages.push(t('Веха: {p0}', { p0: t(m.key, m.params) }));
      if (m.bonus) messages.push(t('Премия за грейд: +{p0}', { p0: fmtMoney(m.bonus) }));
    }
    await saveState(userId, state);
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
  app.post('/event-choice', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { eventId, choiceIndex } = request.body as {
      eventId?: string;
      choiceIndex?: number;
    };
    const state = (await loadState(userId)) as StoredState | null;
    const rng = state ? balanceRng(state) : Math.random;
    if (!state) return reply.status(404).send({ error: 'Game not started' });
    if (!eventId || choiceIndex === undefined) {
      return reply.status(400).send({ error: 'eventId and choiceIndex required' });
    }
    if (state.activeEventId !== eventId) {
      return reply.status(400).send({ error: t('Это событие уже не активно') });
    }
    const content = getContent();
    const event = content.events.find((e: any) => e.id === eventId);
    if (!event) return reply.status(404).send({ error: t('Событие не найдено') });
    const choice = event.choices[choiceIndex];
    if (!choice) return reply.status(400).send({ error: t('Некорректный выбор') });
    // Requirement gates (energy/money/skills/relations)
    const req = choice.requires;
    if (req) {
      if (req.energy && state.energy < req.energy) {
        return reply.status(400).send({ error: t('Не хватает энергии для этого выбора') });
      }
      if (req.money && state.money < req.money) {
        return reply.status(400).send({ error: t('Не хватает денег для этого выбора') });
      }
      if (req.skill) {
        for (const [skillId, level] of Object.entries(req.skill as Record<string, number>)) {
          if ((state.skills[skillId]?.level ?? 0) < level) {
            return reply.status(400).send({ error: t('Недостаточно навыков для этого выбора') });
          }
        }
      }
      if (req.minRelation) {
        for (const [npcId, rel] of Object.entries(req.minRelation as Record<string, number>)) {
          if ((state.relationships[npcId] ?? 0) < rel) {
            return reply.status(400).send({ error: t('Отношения недостаточно хорошие для этого выбора') });
          }
        }
      }
      // D2: связи открывают двери
      if (req.minContacts && contactsOf(state) < req.minContacts) {
        return reply.status(400).send({ error: t('Мало связей для этого выбора') });
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
    const extra = earned.map((a) => t('Достижение: {p0} {p1}', { p0: a.icon, p1: a.name })).join('\n');
    const milestones = recordMilestones(state, content.balance)
      .map((m) => t('Веха: {p0}', { p0: t(m.key, m.params) }))
      .join('\n');
    const message = [followup, extra, milestones].filter(Boolean).join('\n') || undefined;
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    await saveState(userId, state);
    return {
      state: respondState(state, message),
      followup,
      activeEvent: null,
      achievements: earned,
    };
  });
}
