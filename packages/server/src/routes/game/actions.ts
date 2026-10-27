import { t } from '../../lib/i18n';
/**
 * /api/game/action — perform a game action (idempotent).
 *
 * This file owns the action switch and the cost tables. Energy and money
 * costs are validated BEFORE any mutation (idempotency-safe). The action
 * effects themselves are computed in `applyAction` below.
 */
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import { findCompletedAction, rememberAction } from '../../services/idempotency.js';
import {
  applySoftXp,
  applyXp,
  calculateRating,
  canLearnSkill,
  checkEndings,
  findProject,
  bidChance,
  itemEnergyCostChance,
  maybeTriggerActionEvent,
  newlyClaimableArchetypes,
  preScreenMatch,
  preScreenResult,
  projectBlockedReason,
  projectComplete,
  projectFailurePenalty,
  projectPayout,
  recordMilestones,
  remainingTasks,
  weeklySalary,
  bumpSprintProgress,
  clamp,
  checkAchievements,
  spentTimeToday,
  markSpentTime,
  SPEND_TIME_RELATION,
  SPEND_TIME_MOTIVATION,
  addContacts,
  spendContacts,
  CONTACTS_FRIEND_TIME,
  RECOMMENDATION_COST,
  FREELANCE_LEAD_COST,
  P2P_DISCOUNT_COST,
  FREELANCE_LEAD_BONUS,
  FREELANCE_LEAD_CAP,
  P2P_DISCOUNT_RATE,
  type Application,
  type PlayerState,
} from '@itsim/shared';
import {
  ACTION_MONEY_COSTS,
  branchOfMap,
  branchShareXp,
  careerGatesOf,
  careerLevelIndex,
  EXTRA_ENERGY_COSTS,
  fmtMoney,
  GRADE_ENERGY,
  GRADE_POSITIONS,
  GRADE_REQUIREMENTS,
  HOUSING_COSTS,
  HOUSING_NAMES,
  miningSummary,
  MUTATION_RATE_LIMIT,
  perkEffectSum,
  recalcMaxEnergy,
  respondState,
  balanceRng,
  skillLevelMap,
  softOpts,
  sprintView,
  StoredState,
  targetGrade,
  xpGain,
  xpMotivation,
} from './shared.js';
import { runCtoElection } from './ending.js';
import { bumpChallenge } from './_day.js';
interface ActionResult {
  error?: string;
  message?: string;
  delta?: Record<string, any>;
}
function getActionEnergyCost(actionId: string, params: any, content: any): number {
  if (actionId.startsWith('study_')) {
    return content.balance.xpSources?.[actionId]?.energy ?? 2;
  }
  if (actionId === 'networking') {
    return content.balance.networking?.energy ?? EXTRA_ENERGY_COSTS.networking;
  }
  if (actionId === 'side_job') {
    return content.balance.sideJobs?.[params?.jobId]?.energy ?? 1;
  }
  if (actionId === 'project_task') {
    // The cost belongs to the task, so a heavy task stays heavy wherever it runs.
    const def = findProject(content.projects?.projects, String(params?.projectId ?? ''));
    return def?.tasks.find((t: any) => t.id === params?.taskId)?.energy ?? 3;
  }
  return EXTRA_ENERGY_COSTS[actionId] ?? 1;
}
function getActionMoneyCost(actionId: string, params: any, state: PlayerState, content: any): number | null {
  switch (actionId) {
    case 'study_book':
    case 'study_stepik':
    case 'study_course':
    case 'study_advanced_course':
    case 'study_mentor':
      return content.balance.xpSources?.[actionId]?.cost ?? 0;
    case 'study_english_course':
      return content.balance.xpSources?.[actionId]?.cost ?? ACTION_MONEY_COSTS.study_english_course;
    case 'rest_bar':
    case 'rest_lunch':
    case 'rest_gym':
    case 'feed_pet':
      return ACTION_MONEY_COSTS[actionId] ?? 0;
    case 'spend_time_with_friend':
      return 0;
    case 'claim_ending':
      return 0;
    case 'buy_item': {
      const item = content.items.find((i: any) => i.id === params?.itemId);
      return item ? item.price : null;
    }
    case 'upgrade_housing': {
      const next = state.housingLevel + 1;
      if (next > 4) return null;
      return HOUSING_COSTS[next] ?? null;
    }
    default:
      return null;
  }
}
function applyAction(state: StoredState, actionId: string, params: any, content: any): ActionResult {
  const rng = balanceRng(state);
  const delta: Record<string, any> = {};
  // ---- Study actions (hard skills from balance.xpSources) ----
  const isHardSkillStudy =
    actionId.startsWith('study_') && actionId !== 'study_english' && actionId !== 'study_english_course';
  if (isHardSkillStudy) {
    const source = content.balance.xpSources?.[actionId];
    if (!source) return { error: t('Неизвестное действие') };
    const skillId = params?.skillId || state.mainSkillId || 'javascript';
    // Skill-tree gating: locked skills cannot be trained
    const skillDef = (content.skills as any[]).find((s) => s.id === skillId);
    if (!skillDef) return { error: t('Неизвестный навык') };
    if (!canLearnSkill(state, skillDef)) {
      const parentReq = Object.entries(skillDef.unlockAt ?? {})
        .map(([pid, lvl]) => `${pid} ${lvl}+`)
        .join(', ');
      return { error: t('Навык «{p0}» заблокирован. Нужно: {parentReq}', { p0: skillDef.name, parentReq: parentReq }) };
    }
    if (source.maxLevel && (state.skills[skillId]?.level ?? 0) >= source.maxLevel) {
      return { error: t('Этот источник знаний больше ничего не даёт — пора переходить на следующий уровень') };
    }
    state.mainSkillId = skillId;
    const current = state.skills[skillId] ?? { level: 0, xp: 0 };
    const next = applyXp(current, xpGain(state, content, source.xp ?? 6), xpMotivation(state, content));
    state.skills = { ...state.skills, [skillId]: next };
    delta.skills = { [skillId]: { from: current.level, to: next.level } };
    delta.money = -(source.cost ?? 0);
    const leveled = next.level > current.level ? ` (${current.level} → ${next.level})` : '';
    return { message: t('Учёба: {skillId}{leveled}', { skillId: skillId, leveled: leveled }), delta };
  }
  switch (actionId) {
    // ---- English (soft skill, gates foreign companies) ----
    case 'study_english': {
      // Единая правда — balance.xpSources (A3 из ANALYSIS-2026-10-25-balance)
      const src = content.balance.xpSources?.['study_english'];
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = {
        ...state.softSkills,
        english: applySoftXp(eng, src?.xp ?? 10, softOpts(content)),
      };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return {
        message: t('Английский: бесплатные уроки с котиками. Уровень {p0}', {
          p0: state.softSkills['english'].level,
        }),
        delta,
      };
    }
    case 'study_english_course': {
      const src = content.balance.xpSources?.['study_english_course'];
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = {
        ...state.softSkills,
        english: applySoftXp(eng, src?.xp ?? 40, softOpts(content)),
      };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return {
        message: t('Интенсивный курс английского: уровень {p0}. Now you can ask for a raise', {
          p0: state.softSkills['english'].level,
        }),
        delta,
      };
    }
    // ---- Banked offline days (free time) ----
    case 'use_banked_day': {
      if ((state.bankedDays ?? 0) < 1) {
        return { error: t('Банк офлайн-дней пуст. Он копится, пока тебя нет: 1 день за 3.5 часа') };
      }
      state.bankedDays -= 1;
      state.energy = state.maxEnergy;
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.energy = state.maxEnergy;
      delta.motivation = 10;
      return {
        message: t('Офлайн-день использован: полная энергия и +10 мотивации. В банке осталось {p0}', {
          p0: state.bankedDays,
        }),
        delta,
      };
    }
    // ---- Work ----
    case 'work_task': {
      if (!state.job) return { error: t('У тебя нет работы. Сначала откликнись на вакансию в разделе «Карьера»') };
      const learningMult = state.job.companyCulture?.learningMult ?? 1;
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const xp = xpGain(state, content, Math.round(8 * learningMult));
      const next = applyXp(current, xp, xpMotivation(state, content));
      const skills: Record<string, any> = { [skillId]: next };
      // On the job you also absorb the neighbouring skills of your branch —
      // this is the only natural source of the depth *plus breadth* career gates need.
      const carriesPeople = careerLevelIndex(state.grade) >= careerLevelIndex('senior');
      const share = branchShareXp(state, branchOfMap(content), Math.max(2, Math.round(xp / 2)), carriesPeople ? 3 : 2);
      for (const [id, amount] of Object.entries(share)) {
        skills[id] = applyXp(state.skills[id] ?? { level: 0, xp: 0 }, amount, xpMotivation(state, content));
      }
      state.skills = { ...state.skills, ...skills };
      if (careerLevelIndex(state.grade) >= careerLevelIndex('middle')) {
        // middle+ = reviewing other people's PRs: leadership grows with the work itself
        state.softSkills = {
          ...state.softSkills,
          leadership: applySoftXp(
            state.softSkills['leadership'] ?? { level: 0, xp: 0 },
            carriesPeople ? 8 : 4,
            softOpts(content)
          ),
        };
      }
      state.job.daysWorked += 1;
      state.motivation = clamp(state.motivation - 1, 0, 100);
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return {
        message: carriesPeople
          ? t('Задачи + разбор чужого кода. Растёшь не только ты')
          : t('Закрыл рабочие задачи. Ретроспектива отменена, все свободны'),
      };
    }
    case 'work_overtime': {
      if (!state.job) return { error: t('У тебя нет работы') };
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, xpGain(state, content, 10), xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      const bonus = Math.round(weeklySalary(state.job.salary) * 0.2);
      state.money += bonus;
      state.motivation = clamp(state.motivation - 4, 0, 100);
      state.health = clamp(state.health - 1, 0, 100);
      state.job.daysWorked += 1;
      delta.money = bonus;
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: t('Переработка. Начальник доволен (+{p0}), спина — нет', { p0: fmtMoney(bonus) }) };
    }
    case 'pet_project': {
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, xpGain(state, content, 12), xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.reputation = clamp(state.reputation + 0.5, 0, 100);
      delta.reputation = 0.5;
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: t('Пет-проект: ещё один TODO-трекер в портфолио. Репутация растёт') };
    }
    // ---- Projects with deadlines: won by bidding, never handed out ----
    case 'project_task': {
      const active = state.activeProject;
      if (!active) return { error: t('Сначала возьми проект') };
      const def = findProject(content.projects?.projects, active.id);
      if (!def) return { error: t('Проект больше не доступен') };
      const task = remainingTasks(def, active).find((t) => t.id === params?.taskId);
      if (!task) return { error: t('Эта задача уже сделана или её нет в проекте') };
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, xpGain(state, content, task.xp), xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.activeProject = { ...active, tasksDone: [...active.tasksDone, task.id] };
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      delta.activeProject = state.activeProject;
      const left = remainingTasks(def, state.activeProject).length;
      return {
        message: left
          ? t('{p0}. Осталось задач: {left}', { p0: task.title, left: left })
          : t('{p0}. Все задачи готовы — можно сдавать проект', { p0: task.title }),
        delta,
      };
    }
    case 'deliver_project': {
      const active = state.activeProject;
      if (!active) return { error: t('Нет активного проекта') };
      const def = findProject(content.projects?.projects, active.id);
      if (!def) return { error: t('Проект больше не доступен') };
      if (!projectComplete(def, active)) return { error: t('Сначала закрой все задачи проекта') };
      const payout = projectPayout(def, active, state.currentDay);
      state.money += payout.money;
      state.freelanceEarned = (state.freelanceEarned ?? 0) + payout.money;
      state.reputation = clamp(state.reputation + payout.reputation, 0, 100);
      state.projectsDone = [...(state.projectsDone ?? []), def.id];
      state.activeProject = null;
      delta.money = payout.money;
      delta.reputation = payout.reputation;
      delta.activeProject = null;
      return {
        message: payout.late
          ? t('«{p0}» сдан с опозданием: {p1} вместо {p2}', {
              p0: def.title,
              p1: fmtMoney(payout.money),
              p2: fmtMoney(def.payment),
            })
          : t('«{p0}» сдан в срок: +{p1}, +{p2} репутации', {
              p0: def.title,
              p1: fmtMoney(payout.money),
              p2: payout.reputation,
            }),
        delta,
      };
    }
    case 'drop_project': {
      const active = state.activeProject;
      if (!active) return { error: t('Нет активного проекта') };
      const def = findProject(content.projects?.projects, active.id);
      const penalty = def ? projectFailurePenalty(def) : 1;
      state.reputation = clamp(state.reputation - penalty, 0, 100);
      state.activeProject = null;
      delta.reputation = -penalty;
      delta.activeProject = null;
      return { message: t('Проект брошен. Заказчик расстроен: −{penalty} репутации', { penalty: penalty }), delta };
    }
    // ---- Freelance: answer an ad on the board, hear back in the morning ----
    case 'freelance': {
      const def = findProject(content.projects?.projects, String(params?.projectId ?? ''));
      if (!def) return { error: t('Такого заказа нет на бирже') };
      if (state.freelanceDoneToday) return { error: t('Сегодня уже откликался. Заказчики тоже спят') };
      const skillLevel = state.skills[state.mainSkillId]?.level ?? 0;
      const blocked = projectBlockedReason(def, {
        activeProject: state.activeProject,
        skillLevel,
        pendingBid: state.freelanceBid,
      });
      if (blocked) return { error: blocked };
      const chance = bidChance(def, { skillLevel, reputation: state.reputation });
      // D2: тёплый лид — разовый бонус к отклику
      const leadUsed = !!state.freelanceLead;
      const finalChance = leadUsed ? Math.min(FREELANCE_LEAD_CAP, chance + FREELANCE_LEAD_BONUS) : chance;
      if (leadUsed) state.freelanceLead = false;
      state.freelanceBid = { projectId: def.id, day: state.currentDay, chance: finalChance };
      state.freelanceDoneToday = true;
      state.lastFreelanceDay = state.currentDay;
      delta.freelanceBid = state.freelanceBid;
      return {
        message: t('Отклик на «{p0}» отправлен. Заказчик ответит утром — шанс {p1}%', {
          p0: def.title,
          p1: Math.round(finalChance * 100),
        }),
        delta,
      };
    }
    // ---- Side jobs (non-IT gigs: courier, barista, etc.) ----
    case 'side_job': {
      const jobId = params?.jobId;
      const job = content.balance.sideJobs?.[jobId];
      if (!job) return { error: t('Неизвестная подработка') };
      if (state.sideJobDoneToday)
        return { error: t('Сегодня уже была подработка. Совмещать курьера и баристу нельзя — проверено') };
      if (state.currentDay < (job.minDay ?? 1)) return { error: t('Эта подработка откроется позже') };
      const level = state.skills[state.mainSkillId]?.level ?? 0;
      if (level < (job.minSkill ?? 0)) {
        return { error: t('Нужен навык {p0}+ в основной специализации', { p0: job.minSkill }) };
      }
      let payment = job.payment + (job.paymentPerSkill ? Math.round(level * job.paymentPerSkill) : 0);
      if (job.paymentVar) payment += Math.floor(rng() * job.paymentVar);
      // Perk: sideJobPaymentMult
      const mult = perkEffectSum(state, content, 'sideJobPaymentMult');
      payment = Math.round(payment * (1 + mult));
      state.money += payment;
      state.sideJobDoneToday = true;
      state.health = clamp(state.health + (job.health ?? 0), 0, 100);
      state.motivation = clamp(state.motivation + (job.motivation ?? 0), 0, 100);
      state.reputation = clamp(state.reputation + (job.repGain ?? 0), 0, 100);
      if (job.commXp) {
        const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
        state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, job.commXp, softOpts(content)) };
      }
      delta.money = payment;
      return {
        message: t('{p0} {p1}: +{p2}. «Это временно, я же айтишник» — говоришь ты себе', {
          p0: job.icon,
          p1: job.name,
          p2: fmtMoney(payment),
        }),
        delta,
      };
    }
    // ---- Pets ----
    case 'feed_pet': {
      // Real pets have a layerId; cosmetic accessories (bow/crown/glasses) don't count
      const hasPet = (content.items as any[]).some((i) => i.type === 'pet' && i.layerId && state.items.includes(i.id));
      if (!hasPet) return { error: t('У тебя нет питомца. Купи его в магазине') };
      if (state.petFedToday) return { error: t('Питомец уже сыт. Хватит на сегодня') };
      state.petFedToday = true;
      state.motivation = clamp(state.motivation + 3, 0, 100);
      delta.motivation = 3;
      return { message: t('Питомец сыт и счастлив. Урчит, мурчит, виляет (+3 )'), delta };
    }
    // ---- Friends (D1) ----
    case 'spend_time_with_friend': {
      const npcId = String(params?.npcId ?? '');
      const npc = (content.npcs as any[]).find((n) => n.id === npcId);
      if (!npc) return { error: t('Такого друга у тебя нет') };
      if (spentTimeToday(state, npcId)) {
        return { error: t('Вы уже виделись сегодня. Завтра вновь — и будет новый разговор') };
      }
      markSpentTime(state, npcId);
      const before = state.relationships[npcId] ?? 0;
      state.relationships = {
        ...state.relationships,
        [npcId]: clamp(before + SPEND_TIME_RELATION, -100, 100),
      };
      state.motivation = clamp(state.motivation + SPEND_TIME_MOTIVATION, 0, 100);
      // D2: в кругу друга завязываются и новые знакомства
      addContacts(state, CONTACTS_FRIEND_TIME);
      delta.motivation = SPEND_TIME_MOTIVATION;
      delta.relation = { [npcId]: SPEND_TIME_RELATION };
      delta.contacts = CONTACTS_FRIEND_TIME;
      return {
        message: t('Время с другом: {p0} — и отношения крепче (+{p1}). Хороший день', {
          p0: npc.name,
          p1: SPEND_TIME_RELATION,
        }),
      };
    }
    // ---- D2: связи как ресурс — одноразовые баффы ----
    case 'use_recommendation': {
      if (state.recommendation) return { error: t('Рекомендация уже на руках — иди на собеседование') };
      if (!spendContacts(state, RECOMMENDATION_COST)) {
        return { error: t('Столько знакомств нет. Больше общайся — связи не растут на дереве') };
      }
      state.recommendation = true;
      delta.contacts = -RECOMMENDATION_COST;
      return {
        message: t('Тёплая рекомендация на руках: следующее собеседование закончится оффером. Потрачено {p0} связей', {
          p0: RECOMMENDATION_COST,
        }),
      };
    }
    case 'use_freelance_lead': {
      if (state.freelanceLead) return { error: t('Лид уже в кармане — ищи заказ на бирже') };
      if (!spendContacts(state, FREELANCE_LEAD_COST)) {
        return { error: t('Столько знакомств нет. Больше общайся — связи не растут на дереве') };
      }
      state.freelanceLead = true;
      delta.contacts = -FREELANCE_LEAD_COST;
      return {
        message: t('Тёплый лид получен: следующий отклик на заказ — на {p0} п.п. выше. Потрачено {p1} связей', {
          p0: Math.round(FREELANCE_LEAD_BONUS * 100),
          p1: FREELANCE_LEAD_COST,
        }),
      };
    }
    case 'use_p2p_discount': {
      if (state.p2pDiscount) return { error: t('Скидка уже выторгована — трати на барахолке') };
      if (!spendContacts(state, P2P_DISCOUNT_COST)) {
        return { error: t('Столько знакомств нет. Больше общайся — связи не растут на дереве') };
      }
      state.p2pDiscount = true;
      delta.contacts = -P2P_DISCOUNT_COST;
      return {
        message: t('Знакомый продавец ждёт: следующая покупка у игрока — на {p0}% дешевле. Потрачено {p1} связей', {
          p0: Math.round(P2P_DISCOUNT_RATE * 100),
          p1: P2P_DISCOUNT_COST,
        }),
      };
    }
    // ---- Rest ----
    case 'rest_sleep':
      state.motivation = clamp(state.motivation + 15, 0, 100);
      state.health = clamp(state.health + 2, 0, 100);
      delta.motivation = 15;
      delta.health = 2;
      return { message: t('Поспал как человек. Или как айтишник: 10 часов') };
    case 'rest_walk':
      state.motivation = clamp(state.motivation + 8, 0, 100);
      state.health = clamp(state.health + 1, 0, 100);
      delta.motivation = 8;
      delta.health = 1;
      return { message: t('Прогулка. Впервые за неделю увидел солнце') };
    case 'rest_bar':
      state.motivation = clamp(state.motivation + 12, 0, 100);
      delta.motivation = 12;
      return { message: t('Бар с друзьями: обсудили дженерики, легаси и почему всё горит') };
    case 'rest_hobby':
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.motivation = 10;
      return { message: t('Хобби-вечер. Да, сборка лего — это тоже хобби') };
    case 'rest_gym':
      state.health = clamp(state.health + 3, 0, 100);
      state.motivation = clamp(state.motivation + 2, 0, 100);
      delta.health = 3;
      delta.motivation = 2;
      return { message: t('Качалка. Мышцы болят, зато деплой не страшен') };
    case 'rest_lunch': {
      // Еда — потребность, а не фоновый налог: нормальный обед лечит тело
      // и обрывает цепочку голодных дней.
      state.health = clamp(state.health + 5, 0, 100);
      state.motivation = clamp(state.motivation + 3, 0, 100);
      state.hungryDays = 0;
      delta.health = 5;
      delta.motivation = 3;
      return { message: t('Нормально поел: здоровье +5, мотивация +3. Гречка — не приговор') };
    }
    // ---- Social ----
    case 'networking': {
      const net = {
        commXp: 5,
        repGain: 0.5,
        energy: 2,
        dailyCap: 1,
        leadershipPerDay: 0,
        ...(content.balance.networking ?? {}),
      };
      const cap = net.dailyCap ?? 1;
      if ((state.networkingToday ?? 0) >= cap) {
        return { error: t('Нетворкинг на сегодня закончился: митапы не резиновые. Завтра — новый барак') };
      }
      const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
      // A5: единый демпф из balance.softSkills (было без softOpts — 0.5 вместо 0.4)
      state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, net.commXp, softOpts(content)) };
      state.reputation = clamp(state.reputation + net.repGain, 0, 100);
      delta.reputation = net.repGain;
      // Networking is where soft career skills grow: communication, reputation and —
      // for those who already carry people — leadership. Without this drip, leadership
      // had no source below senior and teamlead/CTO were mathematically unreachable.
      const seniorPlus = careerLevelIndex(state.grade) >= careerLevelIndex('senior');
      const leadGain = Math.round((net.leadershipPerDay ?? 0) * (seniorPlus ? 2 : 1));
      if (leadGain > 0) {
        const lead = state.softSkills['leadership'] ?? { level: 0, xp: 0 };
        state.softSkills = { ...state.softSkills, leadership: applySoftXp(lead, leadGain, softOpts(content)) };
      }
      const npcs = content.npcs as any[];
      state.networkingToday = (state.networkingToday ?? 0) + 1;
      if (npcs.length > 0 && rng() < 0.3) {
        const npc = npcs[Math.floor(rng() * npcs.length)];
        state.relationships = {
          ...state.relationships,
          [npc.id]: clamp((state.relationships[npc.id] ?? 0) + 2, -100, 100),
        };
        return {
          message: t('Митап: новые знакомства (+{p0} в контактах). Доклад был скучный, пицца — нет', {
            p0: npc.name,
          }),
        };
      }
      return { message: t('Митап: раздал визитки, собрал 40 стикеров. Репутация растёт') };
    }
    // ---- Career ----
    case 'apply_job': {
      if (state.job) return { error: t('У тебя уже есть работа. Сначала уволься... то есть дойди до выгорания') };
      if (state.currentApplication && ['pending', 'interview_scheduled'].includes(state.currentApplication.status)) {
        return { error: t('У тебя уже есть активный отклик. Дождись результата') };
      }
      const companyId = params?.companyId;
      const company = (content.companies as any[]).find((c) => c.id === companyId);
      if (!company) return { error: t('Компания не найдена') };
      const english = state.softSkills['english']?.level ?? 0;
      if (english < (company.requiresEnglish ?? 0)) {
        return {
          error: t('Нужен английский {p0}+. Твой уровень: {english}. Качай язык!', {
            p0: company.requiresEnglish,
            english: english,
          }),
        };
      }
      const grade = targetGrade(state, content);
      if (!grade) {
        return { error: t('Пока рано откликаться — подтяни навыки (18+ суммарно) и коммуникацию') };
      }
      const req = GRADE_REQUIREMENTS[grade];
      const skillId = state.mainSkillId;
      // D (ANALYSIS-2026-10-27 §3.4): одна лестница — требования интервью
      // равны гейту продвижения (как их считает симулятор). GRADE_REQUIREMENTS
      // остаётся легаси-фолбэком для сейвов без careerGates в контенте.
      const gate = careerGatesOf(content).find((g) => g.grade === grade);
      const requirements = { [skillId]: gate?.skill ?? req.skill };
      const matchScore = preScreenMatch(
        Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.level])),
        requirements
      );
      const screen = preScreenResult(matchScore);
      const application: Application = {
        companyId,
        position: GRADE_POSITIONS[grade],
        grade,
        status: screen.passed ? 'interview_scheduled' : 'rejected',
        matchScore,
        interviewDay: state.currentDay + 2,
        requirements,
        result: screen.passed ? undefined : 'rejected',
      };
      state.currentApplication = application;
      delta.application = application;
      if (!screen.passed) {
        return { message: `📄 ${company.name}: ${screen.msg}`, delta };
      }
      return {
        message: t('Отклик в «{p0}» отправлен. {p1} Собеседование через 2 дня', {
          p0: company.name,
          p1: screen.msg,
        }),
      };
    }
    case 'cancel_application': {
      if (!state.currentApplication) return { error: t('Нет активного отклика') };
      state.currentApplication = null;
      state.interviewSession = undefined;
      return { message: t('Отклик отозван. Заказчики кармы плакали') };
    }
    case 'accept_offer': {
      const offer = state.pendingOffers.find((o) => o.companyId === params?.companyId);
      if (!offer) return { error: t('Оффер не найден или истёк') };
      const company = (content.companies as any[]).find((c) => c.id === offer.companyId);
      if (!company) return { error: t('Компания не найдена') };
      state.job = {
        companyId: offer.companyId,
        position: offer.position,
        grade: offer.grade,
        salary: offer.salary,
        energyPerDay: GRADE_ENERGY[offer.grade],
        daysWorked: 0,
        daysSinceLastPromotion: 0,
        companyCulture: company.culture,
      };
      state.grade = offer.grade;
      state.pendingOffers = [];
      state.currentApplication = null;
      delta.job = state.job;
      return {
        message: t('Ты принят в «{p0}» на позицию {p1}! Зарплата: {p2}/мес', {
          p0: company.name,
          p1: offer.position,
          p2: fmtMoney(offer.salary),
        }),
      };
    }
    case 'decline_offer': {
      const before = state.pendingOffers.length;
      state.pendingOffers = state.pendingOffers.filter((o) => o.companyId !== params?.companyId);
      if (state.pendingOffers.length === before) return { error: t('Оффер не найден') };
      return { message: t('Оффер отклонён. HR переживёт... наверное') };
    }
    case 'cto_elect': {
      const res = runCtoElection(state, content);
      if (res.error) return { error: res.error };
      return { message: res.message };
    }
    // ---- Endings (P1.12) — claim a positive ending; terminals just unlock New Life ----
    case 'claim_ending': {
      const endingId = String(params?.endingId ?? '');
      if (!endingId) return { error: t('endingId обязателен') };
      const list = checkEndings(state, content.balance);
      const target = list.find((e) => e.id === endingId);
      if (!target) return { error: t('Такого финала нет') };
      if (state.careerEnding) return { error: t('Финал уже зафиксирован. Начни новую жизнь — там') };
      if (!target.available) return { error: target.missing ?? t('Условия не выполнены') };
      // Map endingId → CareerEnding
      const map: Record<string, any> = {
        cto: 'corporate_god',
        exit: 'exit',
        free_artist: 'free_artist',
        teacher: 'teacher',
        burnout: 'burnout',
        left_it: 'left_it',
      };
      state.careerEnding = map[endingId];
      // For terminals, free the player from the job so New Life is reachable
      if (endingId === 'burnout' || endingId === 'left_it') state.job = null;
      return { message: t('Финал зафиксирован: {p0}', { p0: target.title }) };
    }
    // ---- Shop ----
    case 'buy_item': {
      const item = (content.items as any[]).find((i) => i.id === params?.itemId);
      if (!item) return { error: t('Предмет не найден') };
      if (!item.price) {
        // Эксклюзивы Stars (price 0) не покупаются за ₽ — их выдают только гранты.
        return { error: t('Эксклюзив Stars — продаётся только в Telegram Stars') };
      }
      if (state.items.includes(item.id)) return { error: t('Уже куплено') };
      state.items = [...state.items, item.id];
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.items = [...state.items];
      return { message: t('Куплено: {p0}', { p0: item.name }) };
    }
    case 'upgrade_housing': {
      const next = (state.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
      if (next > 4) return { error: t('Лучше уже некуда. Это пентхаус, Карл') };
      const cost = HOUSING_COSTS[next];
      if (state.money < cost) return { error: t('Не хватает денег на переезд') };
      // The further up you move, the more of a habit it must be: the account must
      // hold saveMult× the monthly payment, held for saveStreakDays in a row.
      const hdef = ((content.balance.housing ?? []) as any[]).find((h) => h.level === next) ?? {};
      const saveMult = hdef.saveMult ?? 5;
      const needStreak = hdef.saveStreakDays ?? 14;
      if (state.money < cost * saveMult) {
        return {
          error: t('Мало просто иметь {p0}: нужен запас {saveMult}× месячного платежа ({p1})', {
            p0: fmtMoney(cost),
            saveMult: saveMult,
            p1: fmtMoney(cost * saveMult),
          }),
        };
      }
      if (state.savingsSinceDay === undefined || state.currentDay - state.savingsSinceDay < needStreak) {
        const held = state.savingsSinceDay === undefined ? 0 : state.currentDay - state.savingsSinceDay;
        return {
          error: t('Переезд — привычка, а не импульс: держи подушку ещё {p0} дн.', {
            p0: Math.max(1, needStreak - held),
          }),
        };
      }
      // Lifestyle has an entry fee: the landlord looks at income, not at one lucky month.
      const def = ((content.balance.housing ?? []) as any[]).find((h) => h.level === next);
      const incomeGate = def?.incomeGateMult ?? 0;
      if (incomeGate > 0) {
        const income = (state.job?.salary ?? 0) + (state.freelanceLastPayment ?? 0) * 4;
        if (income < incomeGate) {
          return {
            error: t('Аренда по карману доходу: нужно от {p0}/мес (у тебя {p1})', {
              p0: fmtMoney(incomeGate),
              p1: fmtMoney(income),
            }),
          };
        }
      }
      state.housingLevel = next;
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.housingLevel = next;
      return {
        message: t('Переезд! Теперь твой дом — «{p0}». Запах картонных коробок — запах свободы', {
          p0: t(HOUSING_NAMES[next] ?? ''),
        }),
      };
    }
    default:
      return { error: t('Неизвестное действие') };
  }
}
export async function actionRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/action — perform a game action (idempotent)
   */
  app.post('/action', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { actionId, params, idempotencyKey } = request.body as {
      actionId?: string;
      params?: any;
      idempotencyKey?: string;
    };
    if (!actionId) {
      return reply.status(400).send({ error: 'actionId required' });
    }
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }
    // Archetype progress is derived from skill levels — snapshot them so a
    // just-completed route can be announced (P1.3).
    const levelsBefore = skillLevelMap(state);
    // Idempotency — a duplicate request replays nothing and returns the state
    // as it is now (keys are persisted with the save, so restarts are safe).
    if (idempotencyKey) {
      const existing = findCompletedAction(state, idempotencyKey);
      if (existing) {
        return { state: respondState(state, existing.m), delta: {}, activeEvent: null, duplicate: true };
      }
    }
    const content = getContent();
    const rng = balanceRng(state);
    // Validate costs BEFORE any mutation (idempotency-safe)
    let energyCost = getActionEnergyCost(actionId, params, content);
    const costChance = itemEnergyCostChance(state.items, content.items);
    if (costChance > 0 && rng() < costChance) {
      energyCost = Math.max(0, energyCost - 1);
    }
    if (state.energy < energyCost) {
      return reply
        .status(400)
        .send({ error: t('Не хватает энергии — заверши день или отдохни'), state: respondState(state) });
    }
    const moneyCost = getActionMoneyCost(actionId, params, state, content);
    if (moneyCost !== null && state.money < moneyCost) {
      return reply.status(400).send({ error: t('Не хватает денег'), state: respondState(state) });
    }
    const result = applyAction(state, actionId, params, content);
    if (result.error) {
      return reply.status(400).send({ error: result.error, state: respondState(state) });
    }
    state.energy -= energyCost;
    if (moneyCost !== null) state.money -= moneyCost;
    // Daily challenge progress (BEFORE persisting — rewards land in state)
    const challengeMsg = bumpChallenge(state, content, actionId);
    let finalMessage = challengeMsg ? `${result.message}\n${challengeMsg}` : result.message;
    // Weekly sprint progress (P1.2) — same tap, real-time week goals
    const sprintBump = bumpSprintProgress(state.sprint, content.sprints?.themes, actionId, Date.now());
    if (sprintBump) state.sprint = sprintBump.sprint;
    if (sprintBump?.doneJustNow) {
      finalMessage += t('\n Спринт недели выполнен — награда ждёт в карточке спринта');
    }
    // Archetype routes (P1.3): did this action just walk a route to the end?
    const archDefs = content.archetypes?.archetypes ?? [];
    if (archDefs.length > 0) {
      const finished = newlyClaimableArchetypes(archDefs, levelsBefore, skillLevelMap(state), state.archetypeBonuses);
      if (finished.length > 0) {
        const titles = finished.map((a) => `«${a.title}»`).join(', ');
        finalMessage += t('\n Путь {titles} пройден — забери бонус в карточке пути', { titles: titles });
      }
    }
    // E5: достижения проверяются в момент действия, а не ждут конца дня
    for (const a of checkAchievements(state, content.achievements)) {
      finalMessage += `\n${t('Достижение: {p0} {p1} — {p2}', { p0: a.icon, p1: a.name, p2: a.description })}`;
    }
    state.totalActions += 1;
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    // Автопостинг вех («Стал сеньор за 78 дней!»): финал/миллион — пост в ленту
    for (const m of recordMilestones(state, content.balance)) {
      finalMessage += `\n${t('Веха: {p0}', { p0: t(m.key, m.params) })}`;
    }
    await saveState(userId, state);
    // Action-triggered follow-up events (bar -> HR, freelance -> ghost client, ...)
    let triggeredEvent = null as ReturnType<typeof maybeTriggerActionEvent>;
    if (!state.activeEventId) {
      triggeredEvent = maybeTriggerActionEvent(state, content.events, actionId, params?.jobId, rng);
      if (triggeredEvent) {
        state.activeEventId = triggeredEvent.id;
        await saveState(userId, state);
      }
    }
    if (idempotencyKey) {
      rememberAction(state, idempotencyKey, result.message);
      await saveState(userId, state);
    }
    return {
      state: respondState(state, finalMessage),
      delta: result.delta ?? {},
      activeEvent: triggeredEvent,
      mining: miningSummary(state, content),
      sprint: sprintView(state, content, Date.now()),
    };
  });
}
