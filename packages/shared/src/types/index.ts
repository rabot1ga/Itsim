/**
 * Core game types for IT Life Simulator v2.0
 */

// ---- Base Types ----

export type Grade = 'unemployed' | 'intern' | 'junior' | 'middle' | 'senior' | 'teamlead' | 'architect' | 'cto';

export type HousingLevel = 0 | 1 | 2 | 3 | 4 | 5;
// 0 = dorm, 1 = outskirts, 2 = center, 3 = own mortgage, 4 = penthouse

export type ResourceName = 'money' | 'health' | 'motivation' | 'energy' | 'reputation';

export type SkillId = string;
export type PerkId = string;
export type ItemId = string;
export type CompanyId = string;
export type EventId = string;
export type NPCId = string;
export type AchievementId = string;

/**
 * Career gate — a data-driven promotion requirement (content: balance.careerGates).
 * `skill` gates on the level of the MAIN skill (depth), `total` on the sum of all
 * skill levels (breadth) — both must hold, which is what keeps late game honest.
 */
export interface CareerGate {
  grade: Grade;
  label?: string;
  skill: number;
  comm: number;
  rep: number;
  total?: number;
  branchTotal?: number;
  english?: number;
  leadership?: number;
  /** review cycle in days since the last promotion */
  minDaysInGrade?: number;
  /** candidates competing for one open slot (org budget pressure) */
  competition?: number;
  /** not reachable by promotion — requires a special action (CTO election) */
  special?: boolean;
  /** how often the board meets for a special (non-promotion) election */
  electionIntervalDays?: number;
}

/**
 * Daily living costs (food, commute, subscriptions) — the money pressure
 * that salaries alone do not provide (ТЗ section 5.6).
 */
export interface LivingCosts {
  foodBase: number;
  foodBroke?: number;
  perHousingLevel?: number;
  perCareerIndex?: number;
  subscriptionsMonthly?: number;
  /** each owned item shaves a little off lifestyle (cooking gear, gym, ...) */
  lifestyleRefundMultiplier?: number;
  /** wealth tax: money sitting above the threshold pays for the lifestyle around it */
  wealthTaxMonthly?: number;
  wealthTaxThreshold?: number;
  wealthTaxRate?: number;
  wealthTaxCap?: number;
}

/** Career endings (ТЗ «Финалы») */
export type CareerEnding = 'corporate_god' | 'exit' | 'free_artist' | 'teacher' | 'burnout' | 'left_it';

/** Пост ленты вех (автопостинг, README): caption — gettext-ключ + params. */
export interface Milestone {
  /** идемпотентный id факта: `grade:senior`, `million`, `year`, `ending:exit` */
  id: string;
  /** игровой день, когда веха случилась */
  day: number;
  /** gettext-ключ подписи; клиент/сервер собирают через t(key, params) */
  key: string;
  /** параметры подписи; строковые значения t() авто-переводит */
  params?: Record<string, unknown>;
}

/** Якоря позиций питомца на сцене комнаты (роадмап: скины и позиции). */
export const PET_ROOM_POSITIONS = ['bed', 'window', 'rug', 'desk', 'shelf'] as const;
export type PetRoomPosition = (typeof PET_ROOM_POSITIONS)[number];

/** Косметика питомца в комнате: кто сидит (скин) и где (позиция). */
export interface PetRoomLook {
  /** id настоящего питомца из инвентаря (не аксессуар); null — спрятан */
  skin?: string | null;
  position?: PetRoomPosition;
}

// ---- Player State ----

export interface PlayerState {
  /** Секретная соль серверного RNG (P2.4); клиенту не отдаётся. */
  rngSalt?: string;
  /** Счётчик бросков серверного RNG (P2.4); клиенту не отдаётся. */
  rngSeq?: number;
  version: number;

  // Core progress
  currentDay: number;
  grade: Grade;
  money: number;
  health: number;
  motivation: number;
  energy: number;
  maxEnergy: number;
  reputation: number;
  bankedDays: number;
  /** Купленные слоты банка дней (Stars): +1 к ёмкости банка каждый, максимум 3. */
  bankSlots?: number;

  // Career (v2.1 balance layer)
  /** skill the player is known for — the depth requirement of career gates applies to it */
  mainSkillId?: SkillId;
  /** day of the last promotion / last career ending */
  lastPromotionDay?: number;
  /** board election cooldown (CTO), in game days */
  ctoCooldownUntilDay?: number;
  /**
   * Game day the board elected the player CTO — the start of the current,
   * unbroken stint in the seat. `undefined` while the player has never been
   * elected or has since lost the job (the seat, not the grade, is what the
   * `cto` ending measures: see `endings.cto.minDaysAsCto`).
   */
  ctoSinceDay?: number;
  /** terminal career outcome, if reached */
  careerEnding?: CareerEnding;
  /** last charged daily living cost (for UI: «твой день стоит … ₽») */
  lastLivingCost?: number;
  /** consecutive days with zero money (drives the «ушёл из IT» ending) */
  brokeDays?: number;
  /** consecutive days when living costs (food) did not fit the wallet — starvation drains health */
  hungryDays?: number;
  /** last freelance payout — landlord income estimate for players without a job */
  freelanceLastPayment?: number;
  /**
   * Лидерство. Игра растит `softSkills.leadership.level`, а это поле не пишет
   * никто — движок (`leadershipLevel` в engine/endings.ts) читает softSkills
   * первым, а сюда падает только как фолбэк для сейвов, где его заполнили.
   */
  leadership?: number;
  /**
   * Язык интерфейса, выбранный игроком (P2.5, этап 3): поле профиля хранится
   * в сейве и подхватывается на новом устройстве; запросы по-прежнему несут
   * X-Locale (клиент шлёт выбор). Строкой, а не Locale, чтобы типы не тянули
   * i18n; границы валидируют через `isLocale`.
   */
  language?: string;

  /**
   * Автопостинг вех (README «В процессе»): лента авто-постов карьеры и жизни
   * («Стал сеньор за 78 дней!»). Записывает сервер при мутациях сейва,
   * клиент показывает в «Карточке жизни» и шарит в Telegram.
   */
  milestones?: Milestone[];
  /** одноразовый seed ленты: сейвы до фичи не ретро-постятся */
  milestonesSeeded?: boolean;
  /** Скины и позиции питомца в комнате (роадмап): косметика сейва. */
  petRoom?: PetRoomLook;

  // Skills
  skills: Record<SkillId, SkillLevel>;
  perks: PerkId[];
  softSkills: Record<string, SoftSkillLevel>;

  // Career
  job: PlayerJob | null;
  jobWarnings: number;
  pendingOffers: Offer[];
  currentApplication: Application | null;

  // Inventory
  housingLevel: HousingLevel;
  items: ItemId[];
  activeCourses: ActiveCourse[];

  // Events & relationships
  pendingEvents: PendingChainEvent[];
  eventHistory: Record<EventId, EventHistoryEntry>;
  recentEventTags: string[];
  relationships: Record<NPCId, number>;

  // Freelance
  activeFreelance: FreelanceJob | null;

  /** contract with a deadline; missing = no project taken */
  activeProject?: PlayerProject | null;
  /** отклик на заказ, отправленный сегодня; ответ приходит при смене дня */
  freelanceBid?: FreelanceBid | null;
  /** ids of projects delivered in this life */
  projectsDone?: string[];

  // Achievements
  achievements: AchievementId[];

  // Meta
  totalActions: number;
  daysSinceRegistration: number;
  lastMotivationDrift: number;
  burnoutDays: number;

  // Passive income (mining farm)
  miningEarned?: number;

  // Daily challenge progress
  dailyChallenge?: DailyChallengeState;

  // Weekly season sprint (real-time retention, P1.2)
  sprint?: PlayerSprint;

  // Archetype builds (P1.3) — career-scoped guidance + completion bonus
  /** the archetype route currently highlighted on the skill map */
  archetypeChosen?: string;
  /** archetype ids whose bonus has been claimed in THIS life (per-life ledger) */
  archetypeBonuses?: string[];

  // Monetization (Telegram Stars) — cosmetics only, see content/monetization.json
  /** layer ids unlocked by a purchase */
  entitlements?: string[];
  /** profile badges (supporter, fashionista, …) */
  badges?: string[];

  // Daily check-in streak (real-time retention hook, UTC+3 game date)
  /** consecutive real days the player has checked in */
  dailyStreak?: number;
  /** last check-in day, YYYY-MM-DD in the game-day timezone */
  lastCheckInDate?: string;

  // Meta layer (P1.1 «Новая жизнь»): the only thing that survives a reset
  /** prestige ledger — persists across lives, never resets */
  meta?: MetaLife;
}

/**
 * Prestige («Новая жизнь», P1.1). A player who reached a career ending can
 * start over; the career itself resets to day 1 while this ledger, earned
 * achievements, monetization entitlements and the check-in streak survive.
 * Every finished life stacks a permanent XP multiplier (metaXpMult).
 */
export interface MetaLife {
  /** how many lives have been completed (0 = first life, no reset yet) */
  lives: number;
  /** career endings seen, oldest first, deduped — cosmetic «воспоминания» */
  memories: CareerEnding[];
  /** the best grade ever reached across lives */
  bestGrade?: Grade;
  /** the deepest game day ever reached across lives */
  deepestDay?: number;
  /** lifetime total actions across all lives */
  lifetimeActions?: number;
}

export interface SkillLevel {
  level: number;
  xp: number;
}

export interface SoftSkillLevel {
  level: number;
  xp: number;
}

export interface PlayerJob {
  companyId: CompanyId;
  position: string;
  grade: Grade;
  salary: number;
  energyPerDay: number;
  daysWorked: number;
  daysSinceLastPromotion: number;
  companyCulture?: CompanyCulture;
}

export interface Offer {
  companyId: CompanyId;
  position: string;
  grade: Grade;
  salary: number;
  requirements: Record<SkillId, number>;
  expiresInDays: number;
  interviewBar: number;
  companyToxicity: number;
}

export interface Application {
  companyId: CompanyId;
  position: string;
  grade: Grade;
  status: 'pending' | 'interview_scheduled' | 'rejected' | 'accepted';
  matchScore: number;
  interviewDay: number;
  requirements: Record<SkillId, number>;
  answerScore?: number;
  resultDay?: number;
  result?: 'accepted' | 'rejected';
}

export interface ActiveCourse {
  courseId: string;
  skillId: SkillId;
  daysRemaining: number;
  totalDays: number;
  sessionsCompleted: number;
  xpPerSession: number;
  cost: number;
}

export interface FreelanceJob {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  payment: number;
  deadlineDay: number;
  skillId: SkillId;
  minSkillLevel: number;
  daysWorked: number;
  daysRequired: number;
}

// ---- Freelance projects with deadlines (reference 1.png «Работа») ----

export interface ProjectTaskDef {
  id: string;
  title: string;
  xp: number;
  energy: number;
}

export interface ProjectDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  payment: number;
  reputation: number;
  /** game days from the day the project is taken */
  deadlineDays: number;
  minSkillLevel: number;
  tasks: ProjectTaskDef[];
}

/** The one project a player is working on right now. */
/**
 * A pitch for a contract from the board.
 *
 * Taking a project used to be a button: tap and it is yours. That made the
 * freelance action redundant and the board risk-free. Now the player *bids* —
 * spends energy, waits a night, and the client either picks them, throws a
 * paid test task, or goes silent.
 */
export interface FreelanceBid {
  projectId: string;
  /** день, когда отправлен отклик */
  day: number;
  /** шанс выиграть контракт, зафиксирован в момент отклика (0..1) */
  chance: number;
}

export interface PlayerProject {
  id: string;
  startedDay: number;
  deadlineDay: number;
  tasksDone: string[];
}

export interface PendingChainEvent {
  eventId: EventId;
  triggerDay: number;
}

export interface EventHistoryEntry {
  lastDay: number;
  count: number;
}

// ---- Skill Tree ----

export interface SkillDefinition {
  id: SkillId;
  name: string;
  branch: SkillBranch;
  parent?: SkillId;
  unlockAt?: Record<SkillId, number>;
  icon: string;
  maxLevel: number;
  flavor: string;
}

export type SkillBranch =
  'frontend' | 'backend' | 'mobile' | 'qa' | 'devops' | 'ai_ml' | 'cybersec' | 'gamedev' | 'blockchain';

export interface PerkDefinition {
  id: PerkId;
  name: string;
  requires: Record<string, number>;
  effects: PerkEffects;
  flavor: string;
}

export interface PerkEffects {
  jobRequirementDiscount?: number;
  freelancePaymentMult?: number;
  energyBonus?: number;
  learningBonus?: number;
  motivationResistance?: number;
  miningIncomeMult?: number;
  sideJobPaymentMult?: number;
}

// ---- Companies ----

export interface CompanyDefinition {
  id: CompanyId;
  name: string;
  archetype: string;
  size: 'enterprise' | 'startup' | 'product' | 'outsource';
  stack: string[];
  salaryMult: number;
  interviewBar: number;
  toxicity: number;
  growthPotential: number;
  culture: CompanyCulture;
  perks: string[];
  flavor: string;
  requiresEnglish: number;
}

export interface CompanyCulture {
  motivationPerDay: number;
  healthPerDay: number;
  learningMult: number;
  layoffRisk: number;
}

// ---- Events ----

export interface GameEvent {
  id: EventId;
  title: string;
  description: string;
  tags: string[];
  weight: number;
  cooldownDays: number;
  maxOccurrences?: number;
  minGameDay?: number;
  conditions?: EventConditions;
  chainOnly?: boolean;
  /** Triggered by a player action with a probability (never in the day pool) */
  actionTrigger?: ActionEventTrigger;
  choices: EventChoice[];
}

export interface ActionEventTrigger {
  action: string;
  /** For side_job triggers: which gig (courier, barista, ...) */
  jobId?: string;
  /** Probability 0..1 per action */
  chance: number;
  /** Days before the same follow-up can fire again */
  cooldownDays?: number;
}

export interface EventConditions {
  hasJob?: boolean;
  weekday?: number[];
  minGrade?: Grade;
  maxGrade?: Grade;
  minSkill?: Record<SkillId, number>;
  minMoney?: number;
  maxMoney?: number;
  minHealth?: number;
  maxHealth?: number;
  minMotivation?: number;
  maxMotivation?: number;
  minReputation?: number;
  hasItem?: ItemId;
  npcPresent?: NPCId;
  minRelation?: Record<NPCId, number>;
  maxRelation?: Record<NPCId, number>;
  notEventRecently?: EventId[];
}

export interface EventChoice {
  text: string;
  requires?: EventChoiceRequires;
  effects: EventEffects;
  followup?: string;
  chain?: ChainEventRef;
}

export interface EventChoiceRequires {
  energy?: number;
  money?: number;
  skill?: Record<SkillId, number>;
  npcPresent?: NPCId;
  minRelation?: Record<NPCId, number>;
}

export interface EventEffects {
  energy?: number;
  money?: number;
  health?: number;
  motivation?: number;
  reputation?: number;
  karma?: number;
  skill?: Record<SkillId, number>;
  relation?: Record<NPCId, number>;
  jobWarnings?: number;
  burnoutDays?: number;
}

export interface ChainEventRef {
  eventId: EventId;
  afterDays: number;
  chance: number;
}

// ---- NPCs ----

export interface NPCDefinition {
  id: NPCId;
  name: string;
  role: NPCRole;
  description: string;
  avatar: string;
  initialRelation: number;
}

export type NPCRole = 'teamlead' | 'junior' | 'senior_toxic' | 'pm' | 'friend' | 'hr';

// ---- Items ----

export interface ItemDefinition {
  id: ItemId;
  name: string;
  type: 'housing' | 'pc' | 'chair' | 'headphones' | 'coffee' | 'course' | 'pet' | 'other';
  price: number;
  description: string;
  effects: ItemEffects;
  icon: string;
  rarity?: TraitRarity;
}

export interface ItemEffects {
  energyBonus?: number;
  healthBonus?: number;
  motivationBonus?: number;
  xpBonus?: number; // percent
  energyCostChance?: number; // chance to reduce energy cost by 1
  /** Mining hashrate (MH/s) — passive crypto income */
  hashrate?: number;
  /** Fraction of electricity cost saved (0..1, summed up to 0.9) */
  electricitySave?: number;
}

// ---- Achievements ----

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
}

export interface AchievementCondition {
  type: 'grade_reached' | 'money_made' | 'skill_level' | 'days_survived' | 'events_seen' | 'special';
  target?: string | number;
}

// ---- Actions ----

export type ActionId =
  | 'study_youtube'
  | 'study_book'
  | 'study_stepik'
  | 'study_course'
  | 'study_advanced_course'
  | 'study_mentor'
  | 'work_task'
  | 'work_overtime'
  | 'pet_project'
  | 'freelance'
  | 'side_job'
  | 'rest_sleep'
  | 'rest_walk'
  | 'rest_bar'
  | 'rest_hobby'
  | 'rest_gym'
  | 'networking'
  | 'apply_job'
  | 'take_project'
  | 'project_task'
  | 'deliver_project'
  | 'drop_project'
  | 'advance_day';

export interface ActionDefinition {
  id: ActionId;
  name: string;
  description: string;
  energy: number;
  category: 'study' | 'work' | 'freelance' | 'rest' | 'social' | 'career';
}

// ---- Interview ----

export interface InterviewInput {
  skills: Record<string, number>;
  requirements: Record<string, number>;
  communication: number;
  reputation: number;
  companyBar: number;
  answerScore: number;
}

// ---- Procedural generation (DESIGN.md) ----

export type TraitRarity = 'common' | 'rare' | 'legendary';

// ---- Daily challenge ----

export interface DailyChallengeReward {
  money?: number;
  motivation?: number;
  reputation?: number;
}

export interface DailyChallengeDefinition {
  id: string;
  /** Action id, or a prefix with match: 'prefix' (e.g. 'study_' matches all study) */
  action: string;
  match?: 'prefix' | 'exact';
  count: number;
  description: string;
  reward: DailyChallengeReward;
}

/** Per-player progress of the current day's challenge */
export interface DailyChallengeState {
  day: number;
  id: string;
  progress: number;
  count: number;
  done: boolean;
}

// ---- Weekly season sprint (P1.2) ----

/** Per-player record of the current weekly sprint (real-time, UTC+3 week) */
export interface PlayerSprint {
  /** week key: the Monday of the sprint window, YYYY-MM-DD (UTC+3) */
  week: string;
  /** active sprint theme id (from content sprints.json) */
  themeId: string;
  /** goal id → actions counted this week (capped at the goal's count) */
  progress: Record<string, number>;
  /** true once the weekly reward has been claimed — a claim is per-week */
  claimed: boolean;
}

// ---- Rating ----

export const MAX_CAREER_LEVEL = 7; // 0-7 grade index
export const TOTAL_ACHIEVEMENTS = 17;
