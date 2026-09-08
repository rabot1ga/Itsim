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
  avatarChangeCost,
  avatarEntryStatus,
  buildAvatarUnlockContext,
  buildRoomUnlockContext,
  calculateRating,
  canLearnSkill,
  checkEndings,
  findProject,
  floorAllowed,
  floorStyle,
  bidChance,
  geneticTraitForSlot,
  isAvatarSlotId,
  isLookSlot,
  isRoomSlotId,
  itemEnergyCostChance,
  lookColourAllowed,
  LOOK_SLOT_NAMES,
  maybeTriggerActionEvent,
  newlyClaimableArchetypes,
  paintAllowed,
  preScreenMatch,
  preScreenResult,
  projectBlockedReason,
  projectComplete,
  projectFailurePenalty,
  projectPayout,
  REPAINT_COST,
  remainingTasks,
  roomEntryStatus,
  wallPaint,
  weeklySalary,
  bumpSprintProgress,
  clamp,
  type Application,
  type PlayerState,
} from '@itsim/shared';
import { getNftProvider } from '../../services/nftProvider.js';
import {
  branchOfMap,
  branchShareXp,
  careerLevelIndex,
  EXTRA_ENERGY_COSTS,
  fmtMoney,
  GRADE_ENERGY,
  GRADE_POSITIONS,
  GRADE_REQUIREMENTS,
  HOUSING_COSTS,
  miningSummary,
  perkEffectSum,
  recalcMaxEnergy,
  respondState,
  rng,
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
    case 'rest_bar':
      return 2000;
    case 'rest_gym':
      return 3000;
    case 'study_english_course':
      return 3000;
    case 'feed_pet':
      return 500;
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
    case 'customize_room': {
      // Rearranging furniture is free; paint and flooring cost money.
      const slot = params?.slot as string | undefined;
      if (slot !== 'wallColor' && slot !== 'paint' && slot !== 'floor') return null;
      const current =
        slot === 'paint'
          ? state.room?.paint
          : slot === 'floor'
            ? state.room?.floor
            : (state.room?.wallColor ?? state.genetics?.wallColor);
      if (!params?.entryId || params.entryId === current) return null;
      return REPAINT_COST;
    }
    case 'customize_avatar': {
      // Barbers and hat stands charge; the closet is free.
      const slot = params?.slot as string | undefined;
      const entryId = (params?.entryId as string | null | undefined) ?? null;
      if (!slot || isLookSlot(slot)) return null; // recolouring is free
      if (!isAvatarSlotId(slot) || entryId === null) return null;
      const current = (state.avatar as any)?.[slot] ?? geneticTraitForSlot(state.genetics, slot);
      const cost = avatarChangeCost(slot, entryId, current);
      return cost > 0 ? cost : null;
    }
    default:
      return null;
  }
}

function applyAction(
  state: StoredState,
  actionId: string,
  params: any,
  content: any,
  heldCollections: string[] = []
): ActionResult {
  const delta: Record<string, any> = {};

  // ---- Study actions (hard skills from balance.xpSources) ----
  const isHardSkillStudy =
    actionId.startsWith('study_') && actionId !== 'study_english' && actionId !== 'study_english_course';
  if (isHardSkillStudy) {
    const source = content.balance.xpSources?.[actionId];
    if (!source) return { error: 'Неизвестное действие' };

    const skillId = params?.skillId || state.mainSkillId || 'javascript';

    // Skill-tree gating: locked skills cannot be trained
    const skillDef = (content.skills as any[]).find((s) => s.id === skillId);
    if (!skillDef) return { error: 'Неизвестный навык' };
    if (!canLearnSkill(state, skillDef)) {
      const parentReq = Object.entries(skillDef.unlockAt ?? {})
        .map(([pid, lvl]) => `${pid} ${lvl}+`)
        .join(', ');
      return { error: `Навык «${skillDef.name}» заблокирован. Нужно: ${parentReq}` };
    }

    if (source.maxLevel && (state.skills[skillId]?.level ?? 0) >= source.maxLevel) {
      return { error: 'Этот источник знаний больше ничего не даёт — пора переходить на следующий уровень' };
    }

    state.mainSkillId = skillId;
    const current = state.skills[skillId] ?? { level: 0, xp: 0 };
    const next = applyXp(current, xpGain(state, content, source.xp ?? 6), xpMotivation(state, content));
    state.skills = { ...state.skills, [skillId]: next };
    delta.skills = { [skillId]: { from: current.level, to: next.level } };
    delta.money = -(source.cost ?? 0);

    const leveled = next.level > current.level ? ` (${current.level} → ${next.level})` : '';
    return { message: `📚 Учёба: ${skillId}${leveled}`, delta };
  }

  switch (actionId) {
    // ---- English (soft skill, gates foreign companies) ----
    case 'study_english': {
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, english: applySoftXp(eng, 10, softOpts(content)) };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return {
        message: `🇬🇧 Английский: бесплатные уроки с котиками. Уровень ${state.softSkills['english'].level}`,
        delta,
      };
    }

    case 'study_english_course': {
      const eng = state.softSkills['english'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, english: applySoftXp(eng, 25, softOpts(content)) };
      delta.softSkills = { english: { from: eng.level, to: state.softSkills['english'].level } };
      return {
        message: `🇬🇧 Интенсивный курс английского: уровень ${state.softSkills['english'].level}. Now you can ask for a raise`,
        delta,
      };
    }

    // ---- Banked offline days (free time) ----
    case 'use_banked_day': {
      if ((state.bankedDays ?? 0) < 1) {
        return { error: 'Банк офлайн-дней пуст. Он копится, пока тебя нет: 1 день за 3.5 часа' };
      }
      state.bankedDays -= 1;
      state.energy = state.maxEnergy;
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.energy = state.maxEnergy;
      delta.motivation = 10;
      return {
        message: `⏰ Офлайн-день использован: полная энергия и +10 мотивации. В банке осталось ${state.bankedDays}`,
        delta,
      };
    }
    // ---- Work ----
    case 'work_task': {
      if (!state.job) return { error: 'У тебя нет работы. Сначала откликнись на вакансию в разделе «Карьера»' };
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
          ? '💼 Задачи + разбор чужого кода. Растёшь не только ты'
          : '💼 Закрыл рабочие задачи. Ретроспектива отменена, все свободны',
      };
    }

    case 'work_overtime': {
      if (!state.job) return { error: 'У тебя нет работы' };
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
      return { message: `🌙 Переработка. Начальник доволен (+${fmtMoney(bonus)}), спина — нет` };
    }

    case 'pet_project': {
      const skillId = state.mainSkillId;
      const current = state.skills[skillId] ?? { level: 0, xp: 0 };
      const next = applyXp(current, xpGain(state, content, 12), xpMotivation(state, content));
      state.skills = { ...state.skills, [skillId]: next };
      state.reputation = clamp(state.reputation + 0.5, 0, 100);
      delta.reputation = 0.5;
      delta.skills = { [skillId]: { from: current.level, to: next.level } };
      return { message: '🚀 Пет-проект: ещё один TODO-трекер в портфолио. Репутация растёт' };
    }

    // ---- Projects with deadlines: won by bidding, never handed out ----
    case 'project_task': {
      const active = state.activeProject;
      if (!active) return { error: 'Сначала возьми проект' };
      const def = findProject(content.projects?.projects, active.id);
      if (!def) return { error: 'Проект больше не доступен' };
      const task = remainingTasks(def, active).find((t) => t.id === params?.taskId);
      if (!task) return { error: 'Эта задача уже сделана или её нет в проекте' };
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
          ? `✅ ${task.title}. Осталось задач: ${left}`
          : `✅ ${task.title}. Все задачи готовы — можно сдавать проект`,
        delta,
      };
    }

    case 'deliver_project': {
      const active = state.activeProject;
      if (!active) return { error: 'Нет активного проекта' };
      const def = findProject(content.projects?.projects, active.id);
      if (!def) return { error: 'Проект больше не доступен' };
      if (!projectComplete(def, active)) return { error: 'Сначала закрой все задачи проекта' };
      const payout = projectPayout(def, active, state.currentDay);
      state.money += payout.money;
      state.reputation = clamp(state.reputation + payout.reputation, 0, 100);
      state.projectsDone = [...(state.projectsDone ?? []), def.id];
      state.activeProject = null;
      delta.money = payout.money;
      delta.reputation = payout.reputation;
      delta.activeProject = null;
      return {
        message: payout.late
          ? `📦 «${def.title}» сдан с опозданием: ${fmtMoney(payout.money)} вместо ${fmtMoney(def.payment)}`
          : `📦 «${def.title}» сдан в срок: +${fmtMoney(payout.money)}, +${payout.reputation} репутации`,
        delta,
      };
    }

    case 'drop_project': {
      const active = state.activeProject;
      if (!active) return { error: 'Нет активного проекта' };
      const def = findProject(content.projects?.projects, active.id);
      const penalty = def ? projectFailurePenalty(def) : 1;
      state.reputation = clamp(state.reputation - penalty, 0, 100);
      state.activeProject = null;
      delta.reputation = -penalty;
      delta.activeProject = null;
      return { message: `🚪 Проект брошен. Заказчик расстроен: −${penalty} репутации`, delta };
    }

    // ---- Freelance: answer an ad on the board, hear back in the morning ----
    case 'freelance': {
      const def = findProject(content.projects?.projects, String(params?.projectId ?? ''));
      if (!def) return { error: 'Такого заказа нет на бирже' };
      if (state.freelanceDoneToday) return { error: 'Сегодня уже откликался. Заказчики тоже спят' };
      const skillLevel = state.skills[state.mainSkillId]?.level ?? 0;
      const blocked = projectBlockedReason(def, {
        activeProject: state.activeProject,
        skillLevel,
        pendingBid: state.freelanceBid,
      });
      if (blocked) return { error: blocked };

      const chance = bidChance(def, { skillLevel, reputation: state.reputation });
      state.freelanceBid = { projectId: def.id, day: state.currentDay, chance };
      state.freelanceDoneToday = true;
      state.lastFreelanceDay = state.currentDay;
      delta.freelanceBid = state.freelanceBid;
      return {
        message: `📨 Отклик на «${def.title}» отправлен. Заказчик ответит утром — шанс ${Math.round(chance * 100)}%`,
        delta,
      };
    }

    // ---- Side jobs (non-IT gigs: courier, barista, etc.) ----
    case 'side_job': {
      const jobId = params?.jobId;
      const job = content.balance.sideJobs?.[jobId];
      if (!job) return { error: 'Неизвестная подработка' };
      if (state.sideJobDoneToday)
        return { error: 'Сегодня уже была подработка. Совмещать курьера и баристу нельзя — проверено' };
      if (state.currentDay < (job.minDay ?? 1)) return { error: 'Эта подработка откроется позже' };

      const level = state.skills[state.mainSkillId]?.level ?? 0;
      if (level < (job.minSkill ?? 0)) {
        return { error: `Нужен навык ${job.minSkill}+ в основной специализации` };
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
        message: `${job.icon} ${job.name}: +${fmtMoney(payment)}. «Это временно, я же айтишник» — говоришь ты себе`,
        delta,
      };
    }

    // ---- Pets ----
    case 'feed_pet': {
      // Real pets have a layerId; cosmetic accessories (bow/crown/glasses) don't count
      const hasPet = (content.items as any[]).some((i) => i.type === 'pet' && i.layerId && state.items.includes(i.id));
      if (!hasPet) return { error: 'У тебя нет питомца. Купи его в магазине' };
      if (state.petFedToday) return { error: 'Питомец уже сыт. Хватит на сегодня' };
      state.petFedToday = true;
      state.motivation = clamp(state.motivation + 3, 0, 100);
      delta.motivation = 3;
      return { message: '🍖 Питомец сыт и счастлив. Урчит, мурчит, виляет (+3 🔥)', delta };
    }

    // ---- Rest ----
    case 'rest_sleep':
      state.motivation = clamp(state.motivation + 15, 0, 100);
      state.health = clamp(state.health + 2, 0, 100);
      delta.motivation = 15;
      delta.health = 2;
      return { message: '😴 Поспал как человек. Или как айтишник: 10 часов' };

    case 'rest_walk':
      state.motivation = clamp(state.motivation + 8, 0, 100);
      state.health = clamp(state.health + 1, 0, 100);
      delta.motivation = 8;
      delta.health = 1;
      return { message: '🚶 Прогулка. Впервые за неделю увидел солнце' };

    case 'rest_bar':
      state.motivation = clamp(state.motivation + 12, 0, 100);
      delta.motivation = 12;
      return { message: '🍺 Бар с друзьями: обсудили дженерики, легаси и почему всё горит' };

    case 'rest_hobby':
      state.motivation = clamp(state.motivation + 10, 0, 100);
      delta.motivation = 10;
      return { message: '🎮 Хобби-вечер. Да, сборка лего — это тоже хобби' };

    case 'rest_gym':
      state.health = clamp(state.health + 3, 0, 100);
      state.motivation = clamp(state.motivation + 2, 0, 100);
      delta.health = 3;
      delta.motivation = 2;
      return { message: '🏋️ Качалка. Мышцы болят, зато деплой не страшен' };

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
        return { error: 'Нетворкинг на сегодня закончился: митапы не резиновые. Завтра — новый барак' };
      }
      const comm = state.softSkills['communication'] ?? { level: 0, xp: 0 };
      state.softSkills = { ...state.softSkills, communication: applySoftXp(comm, net.commXp) };
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
        return { message: `🤝 Митап: новые знакомства (+${npc.name} в контактах). Доклад был скучный, пицца — нет` };
      }
      return { message: '🤝 Митап: раздал визитки, собрал 40 стикеров. Репутация растёт' };
    }

    // ---- Career ----
    case 'apply_job': {
      if (state.job) return { error: 'У тебя уже есть работа. Сначала уволься... то есть дойди до выгорания' };
      if (state.currentApplication && ['pending', 'interview_scheduled'].includes(state.currentApplication.status)) {
        return { error: 'У тебя уже есть активный отклик. Дождись результата' };
      }

      const companyId = params?.companyId;
      const company = (content.companies as any[]).find((c) => c.id === companyId);
      if (!company) return { error: 'Компания не найдена' };

      const english = state.softSkills['english']?.level ?? 0;
      if (english < (company.requiresEnglish ?? 0)) {
        return { error: `Нужен английский ${company.requiresEnglish}+. Твой уровень: ${english}. Качай язык!` };
      }

      const grade = targetGrade(state, content);
      if (!grade) {
        return { error: 'Пока рано откликаться — подтяни навыки (18+ суммарно) и коммуникацию' };
      }

      const req = GRADE_REQUIREMENTS[grade];
      const skillId = state.mainSkillId;
      const requirements = { [skillId]: req.skill };
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
      return { message: `📄 Отклик в «${company.name}» отправлен. ${screen.msg} Собеседование через 2 дня` };
    }

    case 'cancel_application': {
      if (!state.currentApplication) return { error: 'Нет активного отклика' };
      state.currentApplication = null;
      state.interviewSession = undefined;
      return { message: 'Отклик отозван. Заказчики кармы плакали' };
    }

    case 'accept_offer': {
      const offer = state.pendingOffers.find((o) => o.companyId === params?.companyId);
      if (!offer) return { error: 'Оффер не найден или истёк' };
      const company = (content.companies as any[]).find((c) => c.id === offer.companyId);
      if (!company) return { error: 'Компания не найдена' };

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
        message: `🎉 Ты принят в «${company.name}» на позицию ${offer.position}! Зарплата: ${fmtMoney(offer.salary)}/мес`,
      };
    }

    case 'decline_offer': {
      const before = state.pendingOffers.length;
      state.pendingOffers = state.pendingOffers.filter((o) => o.companyId !== params?.companyId);
      if (state.pendingOffers.length === before) return { error: 'Оффер не найден' };
      return { message: 'Оффер отклонён. HR переживёт... наверное' };
    }

    case 'cto_elect': {
      const res = runCtoElection(state, content);
      if (res.error) return { error: res.error };
      return { message: res.message };
    }

    // ---- Endings (P1.12) — claim a positive ending; terminals just unlock New Life ----
    case 'claim_ending': {
      const endingId = String(params?.endingId ?? '');
      if (!endingId) return { error: 'endingId обязателен' };
      const list = checkEndings(state, content.balance);
      const target = list.find((e) => e.id === endingId);
      if (!target) return { error: 'Такого финала нет' };
      if (state.careerEnding) return { error: 'Финал уже зафиксирован. Начни новую жизнь — там' };
      if (!target.available) return { error: target.missing ?? 'Условия не выполнены' };
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
      return { message: `🏁 Финал зафиксирован: ${target.title}` };
    }

    // ---- Shop ----
    case 'buy_item': {
      const item = (content.items as any[]).find((i) => i.id === params?.itemId);
      if (!item) return { error: 'Предмет не найден' };
      if (state.items.includes(item.id)) return { error: 'Уже куплено' };
      state.items = [...state.items, item.id];
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.items = [...state.items];
      if (item.nft) {
        // NFT items are minted on purchase (DESIGN.md 3.2) — mock provider
        delta.mintedItem = {
          id: item.id,
          name: item.name,
          description: item.description,
          rarity: item.rarity,
          layerId: item.layerId,
        };
        return { message: `🛒 Куплено: ${item.name}. NFT смонтирован (мок) 🔗`, delta };
      }
      return { message: `🛒 Куплено: ${item.name}` };
    }

    case 'upgrade_housing': {
      const next = (state.housingLevel + 1) as 0 | 1 | 2 | 3 | 4;
      if (next > 4) return { error: 'Лучше уже некуда. Это пентхаус, Карл' };
      const cost = HOUSING_COSTS[next];
      if (state.money < cost) return { error: 'Не хватает денег на переезд' };
      // The further up you move, the more of a habit it must be: the account must
      // hold saveMult× the monthly payment, held for saveStreakDays in a row.
      const hdef = ((content.balance.housing ?? []) as any[]).find((h) => h.level === next) ?? {};
      const saveMult = hdef.saveMult ?? 5;
      const needStreak = hdef.saveStreakDays ?? 14;
      if (state.money < cost * saveMult) {
        return {
          error: `Мало просто иметь ${fmtMoney(cost)}: нужен запас ${saveMult}× месячного платежа (${fmtMoney(cost * saveMult)})`,
        };
      }
      if (state.savingsSinceDay === undefined || state.currentDay - state.savingsSinceDay < needStreak) {
        const held = state.savingsSinceDay === undefined ? 0 : state.currentDay - state.savingsSinceDay;
        return { error: `Переезд — привычка, а не импульс: держи подушку ещё ${Math.max(1, needStreak - held)} дн.` };
      }
      // Lifestyle has an entry fee: the landlord looks at income, not at one lucky month.
      const def = ((content.balance.housing ?? []) as any[]).find((h) => h.level === next);
      const incomeGate = def?.incomeGateMult ?? 0;
      if (incomeGate > 0) {
        const income = (state.job?.salary ?? 0) + (state.freelanceLastPayment ?? 0) * 4;
        if (income < incomeGate) {
          return {
            error: `Аренда по карману доходу: нужно от ${fmtMoney(incomeGate)}/мес (у тебя ${fmtMoney(income)})`,
          };
        }
      }
      state.housingLevel = next;
      state.maxEnergy = recalcMaxEnergy(state, content);
      delta.housingLevel = next;
      return { message: `🏠 Переезд: новый уровень жилья ${next}. Запах картонных коробок — запах свободы` };
    }

    case 'customize_room': {
      const slot = params?.slot as string | undefined;
      const entryId = (params?.entryId as string | null | undefined) ?? null;
      const isoSlot = slot === 'paint' || slot === 'floor';
      if (!slot || (!isoSlot && slot !== 'wallColor' && !isRoomSlotId(slot))) {
        return { error: 'Неизвестный слот комнаты' };
      }
      if (!state.room) state.room = { slots: {} };

      // null = back to automatic
      if (entryId === null) {
        if (slot === 'wallColor') delete state.room.wallColor;
        else if (slot === 'paint') delete state.room.paint;
        else if (slot === 'floor') delete state.room.floor;
        else delete state.room.slots[slot];
        delta.room = state.room;
        return { message: '🎨 Вернули как было (авто)', delta };
      }

      // Isometric finishes: paint and flooring, gated by what the flat can carry.
      if (slot === 'paint' || slot === 'floor') {
        const allowed =
          slot === 'paint'
            ? paintAllowed(entryId, state.housingLevel ?? 0)
            : floorAllowed(entryId, state.housingLevel ?? 0);
        if (!allowed) return { error: 'Такая отделка недоступна для этого жилья' };
        const name = slot === 'paint' ? (wallPaint(entryId)?.name ?? entryId) : (floorStyle(entryId)?.name ?? entryId);
        if (slot === 'paint') state.room.paint = entryId;
        else state.room.floor = entryId;
        delta.room = state.room;
        return {
          message:
            slot === 'paint'
              ? `🎨 Стены перекрашены: ${name} (−${REPAINT_COST} ₽ за банку краски)`
              : `🪵 Новый пол: ${name} (−${REPAINT_COST} ₽ за материал)`,
          delta,
        };
      }

      if (slot === 'wallColor') {
        const palette = (content.genetics?.wallPalette ?? []) as any[];
        if (!palette.some((p) => p.id === entryId)) return { error: 'Такого цвета нет в палитре' };
        state.room.wallColor = entryId;
        delta.room = state.room;
        const name = palette.find((p) => p.id === entryId)?.name ?? entryId;
        return { message: `🎨 Стены перекрашены: ${name} (−${REPAINT_COST} ₽ за банку краски)`, delta };
      }

      const manifestSlot = (content.roomLayers?.slots ?? []).find((s: any) => s.id === slot);
      if (!manifestSlot?.entries?.some((e: any) => e.id === entryId)) {
        return { error: 'Такого предмета нет в этом слоте' };
      }
      const status = roomEntryStatus(buildRoomUnlockContext(state, heldCollections), slot, entryId);
      if (!status.unlocked) return { error: `🔒 ${status.hint}` };
      state.room.slots[slot] = entryId;
      delta.room = state.room;
      return { message: '🎨 Комната обновлена', delta };
    }

    case 'customize_avatar': {
      const slot = params?.slot as string | undefined;
      const entryId = (params?.entryId as string | null | undefined) ?? null;
      if (!slot || (!isAvatarSlotId(slot) && !isLookSlot(slot))) {
        return { error: 'Неизвестный слот внешности' };
      }
      if (!state.avatar) state.avatar = {};

      if (entryId === null) {
        delete (state.avatar as any)[slot];
        delta.avatar = state.avatar;
        return { message: '🧍 Вернули как было от природы', delta };
      }

      // Colours: a mirror is free, but only palette colours are accepted.
      if (isLookSlot(slot)) {
        if (!lookColourAllowed(slot, entryId)) return { error: 'Такого цвета нет в палитре' };
        (state.avatar as any)[slot] = entryId.toLowerCase();
        delta.avatar = state.avatar;
        return { message: `🎨 ${LOOK_SLOT_NAMES[slot]}: обновлено`, delta };
      }

      const manifestSlot = (content.avatarLayers?.slots ?? []).find((s: any) => s.id === slot);
      if (!manifestSlot?.entries?.some((e: any) => e.id === entryId)) {
        return { error: 'Такого варианта нет в этом слоте' };
      }
      const status = avatarEntryStatus(buildAvatarUnlockContext(state), slot, entryId);
      if (!status.unlocked) return { error: `🔒 ${status.hint}` };
      (state.avatar as any)[slot] = entryId;
      delta.avatar = state.avatar;
      const flavor =
        slot === 'hair' ? '💇 Новая стрижка' : slot === 'beard' ? '🪒 Борода обновлена' : '🧍 Образ обновлён';
      return { message: flavor, delta };
    }

    default:
      return { error: 'Неизвестное действие' };
  }
}

export async function actionRoutes(app: FastifyInstance) {
  /**
   * POST /api/game/action — perform a game action (idempotent)
   */
  app.post('/action', async (request, reply) => {
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

    const state = loadState(userId) as StoredState | null;
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

    // Validate costs BEFORE any mutation (idempotency-safe)
    let energyCost = getActionEnergyCost(actionId, params, content);
    const costChance = itemEnergyCostChance(state.items, content.items);
    if (costChance > 0 && rng() < costChance) {
      energyCost = Math.max(0, energyCost - 1);
    }
    if (state.energy < energyCost) {
      return reply
        .status(400)
        .send({ error: 'Не хватает энергии — заверши день или отдохни', state: respondState(state) });
    }

    const moneyCost = getActionMoneyCost(actionId, params, state, content);
    if (moneyCost !== null && state.money < moneyCost) {
      return reply.status(400).send({ error: 'Не хватает денег', state: respondState(state) });
    }

    // Room editor: cross-collection layers need the on-chain (mock) holdings
    let heldCollections: string[] = [];
    if (actionId === 'customize_room') {
      try {
        const wallet = state.walletAddress ?? `local:${userId}`;
        heldCollections = await getNftProvider().getHeldCollections(wallet);
      } catch {
        heldCollections = [];
      }
    }

    const result = applyAction(state, actionId, params, content, heldCollections);
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
      finalMessage += '\n🎯 Спринт недели выполнен — награда ждёт в карточке спринта';
    }

    // Archetype routes (P1.3): did this action just walk a route to the end?
    const archDefs = content.archetypes?.archetypes ?? [];
    if (archDefs.length > 0) {
      const finished = newlyClaimableArchetypes(archDefs, levelsBefore, skillLevelMap(state), state.archetypeBonuses);
      if (finished.length > 0) {
        const titles = finished.map((a) => `«${a.title}»`).join(', ');
        finalMessage += `\n🏆 Путь ${titles} пройден — забери бонус в карточке пути`;
      }
    }

    state.totalActions += 1;
    state.maxEnergy = recalcMaxEnergy(state, content);
    state.ratingScore = calculateRating(state);
    saveState(userId, state);

    // Mint NFT if the purchased item is on-chain (mock provider, DESIGN.md 3.2)
    let nft = null;
    const mintedItem = result.delta?.mintedItem;
    if (mintedItem) {
      const wallet = state.walletAddress ?? `local:${userId}`;
      const itemType = (content.items as any[]).find((i: any) => i.id === mintedItem.id)?.type ?? 'item';
      nft = await getNftProvider().mint(wallet, mintedItem, String(itemType).toUpperCase().slice(0, 10));
    }

    // Action-triggered follow-up events (bar -> HR, freelance -> ghost client, ...)
    let triggeredEvent = null as ReturnType<typeof maybeTriggerActionEvent>;
    if (!state.activeEventId) {
      triggeredEvent = maybeTriggerActionEvent(state, content.events, actionId, params?.jobId, rng);
      if (triggeredEvent) {
        state.activeEventId = triggeredEvent.id;
        saveState(userId, state);
      }
    }

    if (idempotencyKey) {
      rememberAction(state, idempotencyKey, result.message);
      saveState(userId, state);
    }

    return {
      state: respondState(state, finalMessage),
      delta: result.delta ?? {},
      activeEvent: triggeredEvent,
      nft,
      mining: miningSummary(state, content),
      sprint: sprintView(state, content, Date.now()),
    };
  });
}
