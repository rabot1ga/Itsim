import { z } from 'zod';

/**
 * Zod schemas for content validation
 * Section 15.2 — all content JSON configs validated at server start
 */

export const EventChoiceRequiresSchema = z.object({
  energy: z.number().int().optional(),
  money: z.number().optional(),
  skill: z.record(z.string(), z.number()).optional(),
  npcPresent: z.string().optional(),
  minRelation: z.record(z.string(), z.number()).optional(),
  /** D2: сколько связей нужно, чтобы открыть этот выбор */
  minContacts: z.number().int().min(0).optional(),
});

export const EventEffectsSchema = z.object({
  energy: z.number().int().optional(),
  money: z.number().optional(),
  health: z.number().optional(),
  motivation: z.number().optional(),
  reputation: z.number().optional(),
  karma: z.number().optional(),
  skill: z.record(z.string(), z.number()).optional(),
  relation: z.record(z.string(), z.number()).optional(),
  jobWarnings: z.number().int().optional(),
  burnoutDays: z.number().int().optional(),
  /** D2: networking contacts (мероприятия/знакомые) */
  contacts: z.number().int().optional(),
});

export const ChainEventRefSchema = z.object({
  eventId: z.string(),
  afterDays: z.number().int().positive(),
  chance: z.number().min(0).max(1),
});

export const EventChoiceSchema = z.object({
  text: z.string().min(1).max(120),
  requires: EventChoiceRequiresSchema.optional(),
  effects: EventEffectsSchema,
  followup: z.string().max(400).optional(),
  chain: ChainEventRefSchema.optional(),
});

export const EventConditionsSchema = z.object({
  hasJob: z.boolean().optional(),
  weekday: z.array(z.number().int().min(0).max(6)).optional(),
  minGrade: z.string().optional(),
  maxGrade: z.string().optional(),
  minSkill: z.record(z.string(), z.number()).optional(),
  minMoney: z.number().optional(),
  maxMoney: z.number().optional(),
  minHealth: z.number().min(0).max(100).optional(),
  maxHealth: z.number().min(0).max(100).optional(),
  minMotivation: z.number().min(0).max(100).optional(),
  maxMotivation: z.number().min(0).max(100).optional(),
  minReputation: z.number().min(0).max(100).optional(),
  hasItem: z.string().optional(),
  npcPresent: z.string().optional(),
  minRelation: z.record(z.string(), z.number()).optional(),
  maxRelation: z.record(z.string(), z.number()).optional(),
  notEventRecently: z.array(z.string()).optional(),
});

export const ActionEventTriggerSchema = z.object({
  action: z.string().min(1),
  jobId: z.string().optional(),
  chance: z.number().min(0).max(1),
  cooldownDays: z.number().int().min(0).optional(),
});

export const EventSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  tags: z.array(z.string()).min(1),
  weight: z.number().positive(),
  cooldownDays: z.number().int().min(0),
  maxOccurrences: z.number().int().positive().optional(),
  minGameDay: z.number().int().min(0).default(0),
  conditions: EventConditionsSchema.optional(),
  // Chain-only events never enter the random pool — they trigger
  // exclusively through `chain` references of other events
  chainOnly: z.boolean().default(false),
  // Action-triggered events never enter the random pool either —
  // they roll after the matching player action
  actionTrigger: ActionEventTriggerSchema.optional(),
  // Рабочие теги (work/office/sprint/project) требуют работы; исключения
  // (внешние предложения, импостор-синдром и т.п.) помечаются этим флагом
  allowWithoutJob: z.boolean().default(false),
  choices: z.array(EventChoiceSchema).min(2).max(4),
});

export const EventsFileSchema = z.array(EventSchema);

// Skill schema
export const SkillSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  branch: z.enum(['frontend', 'backend', 'mobile', 'qa', 'devops', 'ai_ml', 'cybersec', 'gamedev', 'blockchain']),
  parent: z.string().optional(),
  unlockAt: z.record(z.string(), z.number()).optional(),
  icon: z.string(),
  maxLevel: z.number().int().positive().default(100),
  flavor: z.string(),
});

export const SkillsFileSchema = z.array(SkillSchema);

// Perk schema
export const PerkSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  requires: z.record(z.string(), z.number()),
  effects: z.object({
    jobRequirementDiscount: z.number().min(0).max(1).optional(),
    freelancePaymentMult: z.number().min(1).optional(),
    energyBonus: z.number().int().optional(),
    learningBonus: z.number().min(0).max(1).optional(),
    motivationResistance: z.number().min(0).max(1).optional(),
    miningIncomeMult: z.number().min(0).optional(),
    sideJobPaymentMult: z.number().min(0).optional(),
  }),
  flavor: z.string(),
});

export const PerksFileSchema = z.array(PerkSchema);

// Company schema
export const CompanyCultureSchema = z.object({
  motivationPerDay: z.number(),
  healthPerDay: z.number(),
  learningMult: z.number(),
  layoffRisk: z.number().min(0).max(1),
});

export const CompanySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  archetype: z.string(),
  size: z.enum(['enterprise', 'startup', 'product', 'outsource']),
  stack: z.array(z.string()),
  salaryMult: z.number(),
  interviewBar: z.number(),
  toxicity: z.number().min(0).max(100),
  growthPotential: z.number().min(0).max(100),
  culture: CompanyCultureSchema,
  perks: z.array(z.string()),
  flavor: z.string(),
  requiresEnglish: z.number().int().min(0).max(100),
});

export const CompaniesFileSchema = z.array(CompanySchema);

// NPC schema
export const NPCSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  role: z.enum(['teamlead', 'junior', 'senior_toxic', 'pm', 'friend', 'hr']),
  description: z.string(),
  avatar: z.string(),
  initialRelation: z.number().int().min(-100).max(100).default(0),
});

export const NPCsFileSchema = z.array(NPCSchema);

// Item schema
/**
 * Только те эффекты, которые движок действительно применяет: `engine/items.ts`
 * (xpBonus, energyCostChance, motivationBonus, healthBonus, energyBonus) и
 * `engine/mining.ts` (hashrate, electricitySave).
 *
 * `speedBonus` и `reputationBonus` убраны 27.09.2026: не читались ничем, но уже
 * попали в подписи магазина («+30 % скорость», «+10 репутация»). Нужен эффект —
 * сначала модуль движка и коридоры `simulate --check`, потом ключ.
 */
export const ItemEffectsSchema = z.object({
  energyBonus: z.number().int().optional(),
  healthBonus: z.number().int().optional(),
  motivationBonus: z.number().int().optional(),
  xpBonus: z.number().optional(),
  energyCostChance: z.number().min(0).max(1).optional(),
  hashrate: z.number().positive().optional(),
  electricitySave: z.number().min(0).max(1).optional(),
});

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  type: z.enum(['housing', 'pc', 'chair', 'headphones', 'coffee', 'course', 'pet', 'other']),
  price: z.number().int().min(0),
  description: z.string(),
  effects: ItemEffectsSchema,
  icon: z.string(),
  nft: z.boolean().default(false),
  rarity: z.enum(['common', 'rare', 'legendary']).optional(),
  layerId: z.string().optional(),
});

export const ItemsFileSchema = z.array(ItemSchema);

// Achievement schema
export const AchievementConditionSchema = z.object({
  type: z.enum(['grade_reached', 'money_made', 'skill_level', 'days_survived', 'events_seen', 'special']),
  target: z.union([z.string(), z.number()]).optional(),
});

export const AchievementSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  condition: AchievementConditionSchema,
});

export const AchievementsFileSchema = z.array(AchievementSchema);

// Balance schema
export const BalanceSchema = z.object({
  version: z.string(),
  // Energy
  baseEnergy: z.number().default(10),
  maxEnergy: z.number().default(16),
  minEnergy: z.number().default(3),
  offlineHoursPerDay: z.number().default(3.5),
  maxBankedDays: z.number().default(7),

  // Motivation
  motivationDailyDrift: z.number().default(-0.5),
  motivationHealthCapSlope: z.number().default(0.6),
  motivationHealthCapBase: z.number().default(40),

  // Health
  foodHealthCook: z.number().default(1),
  foodHealthDelivery: z.number().default(0),

  // Economy
  startingMoney: z.number().default(10000),
  rentGraceDays: z.number().default(3),
  salaryWeeksPerMonth: z.number().default(4.3),

  // XP
  motivationMultMin: z.number().default(0.7),
  motivationMultMax: z.number().default(1.3),
  motivationMultSlope: z.number().default(0.006),

  // XP sources
  xpSources: z.record(
    z.string(),
    z.object({
      xp: z.number(),
      energy: z.number(),
      cost: z.number().default(0),
      maxLevel: z.number().default(100),
    })
  ),

  // Networking tuning (communication XP, reputation gain, energy cost,
  // daily cap — soft skills must not be farmable without limit)
  networking: z
    .object({
      commXp: z.number().default(5),
      repGain: z.number().default(0.5),
      energy: z.number().default(2),
      dailyCap: z.number().int().min(1).default(1),
      leadershipPerDay: z.number().min(0).default(0),
      repFromPromotion: z.number().min(0).default(0),
    })
    .default({ commXp: 5, repGain: 0.5, energy: 2, dailyCap: 1, leadershipPerDay: 0, repFromPromotion: 0 }),

  // Soft-skill saturation: above this level XP trickles (people skills saturate)
  softSkills: z
    .object({
      saturatesAt: z.number().int().min(1).default(30),
      xpDamping: z.number().min(0).max(1).default(0.5),
    })
    .default({ saturatesAt: 30, xpDamping: 0.5 }),

  // Event frequency
  eventChanceOnboarding: z.number().default(0.2),
  eventChanceEarly: z.number().default(0.35),
  eventChanceMid: z.number().default(0.28),
  eventChanceLate: z.number().default(0.2),

  // Housing
  housing: z.array(
    z.object({
      level: z.number(),
      name: z.string(),
      cost: z.number(),
      energyBonus: z.number(),
      motivationBonus: z.number(),
      /** monthly income required to move in (lifestyle has an entry fee) */
      incomeGateMult: z.number().min(0).default(0),
      /** how many monthly payments must be sitting in the account to move */
      saveMult: z.number().min(1).default(5),
      /** how many days that cushion must be held (savings habit, not one lucky month) */
      saveStreakDays: z.number().int().min(0).default(14),
    })
  ),

  // Side jobs (non-IT gigs — courier, barista, etc.)
  sideJobs: z
    .record(
      z.string(),
      z.object({
        name: z.string(),
        icon: z.string().default('💼'),
        energy: z.number().int().min(0),
        payment: z.number(),
        paymentPerSkill: z.number().optional(),
        paymentVar: z.number().optional(),
        health: z.number().default(0),
        motivation: z.number().default(0),
        commXp: z.number().default(0),
        repGain: z.number().default(0),
        minSkill: z.number().default(0),
        minDay: z.number().int().default(1),
      })
    )
    .default({}),

  // Mining farm (passive crypto income)
  mining: z
    .object({
      priceBase: z.number().positive(),
      volatility: z.number().min(0).max(1),
      electricityPerHashrate: z.number().min(0),
    })
    .default({ priceBase: 40, volatility: 0.5, electricityPerHashrate: 0.5 }),

  // Career gates (v2.1): data-driven promotion ladder.
  // skill = level of the MAIN skill (depth); total = sum over all skills (breadth).
  careerGates: z
    .array(
      z.object({
        grade: z.enum(['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto']),
        label: z.string().optional(),
        skill: z.number().int().min(0),
        comm: z.number().int().min(0),
        rep: z.number().int().min(0),
        total: z.number().int().min(0).default(0),
        branchTotal: z.number().int().min(0).optional(),
        english: z.number().int().min(0).optional(),
        leadership: z.number().int().min(0).optional(),
        minDaysInGrade: z.number().int().min(1).default(7),
        competition: z.number().int().min(1).default(1),
        special: z.boolean().default(false),
        /** how often the board meets for a special (non-promotion) election */
        electionIntervalDays: z.number().int().min(1).default(60),
      })
    )
    .optional(),

  // Daily living costs (ТЗ 5.6) — the counterweight to high late-game salaries
  livingCosts: z
    .object({
      foodBase: z.number().min(0).default(350),
      foodBroke: z.number().min(0).default(180),
      perHousingLevel: z.number().min(0).default(0),
      perCareerIndex: z.number().min(0).default(0),
      subscriptionsMonthly: z.number().min(0).default(0),
      lifestyleRefundMultiplier: z.number().min(0).default(0),
      wealthTaxMonthly: z.number().min(0).default(0),
      wealthTaxThreshold: z.number().min(0).default(500000),
      wealthTaxRate: z.number().min(0).max(1).default(0),
      wealthTaxCap: z.number().min(0).default(0),
    })
    .optional(),

  // Career endings (ТЗ «Финалы») — terminal states reached by living conditions
  endings: z
    .object({
      // terminal triggers (negative paths)
      burnoutDays: z.number().int().min(1).default(7),
      brokeDaysToQuit: z.number().int().min(1).default(15),
      // positive-endings thresholds (gated by player state)
      exit: z
        .object({
          minReputation: z.number().int().min(0).default(80),
          minMoney: z.number().int().min(0).default(100_000_000),
          minGrade: z.enum(['senior', 'teamlead', 'architect', 'cto']).default('senior'),
          title: z.string().default('🚀 Экзит · Стартап-единорог'),
          description: z
            .string()
            .default('Ты ушёл в свой проект, и его оценили в 100 млн. Жизнь на своих условиях — самый дорогой приз.'),
        })
        .default({}),
      free_artist: z
        .object({
          minReputation: z.number().int().min(0).default(40),
          maxMoney: z.number().int().min(0).default(1_000_000),
          minGrade: z.enum(['middle', 'senior', 'teamlead', 'architect', 'cto']).default('senior'),
          title: z.string().default('💻 Свободный художник'),
          description: z.string().default('Никакого офиса. Только ты, клиенты и код. Меньше денег — больше свободы.'),
        })
        .default({}),
      teacher: z
        .object({
          minReputation: z.number().int().min(0).default(60),
          /**
           * «Учитель» — путь наставника. После ребаланса 22.10.2026 условие
           * собрано из того, что игра действительно копит: лидерство растит
           * `applySoftXp`, глубину ремесла меряет `mainSkillLevel`. Мёртвый
           * счётчик `mentoredJuniors`, который не писал ни один модуль,
           * убран вместе с недостижимым финалом.
           */
          minLeadership: z.number().int().min(0).default(24),
          minSkillLevel: z.number().int().min(0).default(62),
          title: z.string().default('🎓 Учитель'),
          description: z
            .string()
            .default('Джуны, которых ты вёл, выросли в сеньоров и архитекторов. Их успехи — твои.'),
        })
        .default({}),
      cto: z
        .object({
          minReputation: z.number().int().min(0).default(68),
          minLeadership: z.number().int().min(0).default(32),
          /**
           * Сколько игровых дней надо продержаться в кресле CTO, чтобы финал
           * открылся (В2 из docs/PROPOSALS-2026-09-27-endgame.md: выборы больше
           * не фиксируют финал в день победы).
           */
          minDaysAsCto: z.number().int().min(0).default(60),
          title: z.string().default('🏢 Корпоративный бог · CTO'),
          description: z.string().default('Борд избрал тебя CTO. Корпорация — это ты.'),
        })
        .default({}),
      burnout: z
        .object({
          title: z.string().default('🔥 Выгорание'),
          description: z
            .string()
            .default('Здоровье и мотивация в нуле. Тело и психика сказали «стоп». Следующая жизнь — с +15% XP.'),
        })
        .default({}),
      left_it: z
        .object({
          title: z.string().default('💀 Ушёл из IT'),
          description: z
            .string()
            .default(
              'Денег нет, перспектив тоже. Ты закрыл редактор и пошёл учиться на повара. Следующая жизнь — с чистого листа.'
            ),
        })
        .default({}),
    })
    .optional(),

  // Shop catalogue (3.7): categories live in content so we can add/rename
  // tabs without shipping a new client. `match` is a list of `Item.type`
  // values the tab covers; `matchIds` is a list of explicit item ids;
  // `matchPrefixes` covers dynamic ids like `mining_*`.
  shop: z
    .object({
      categories: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .regex(/^[a-z0-9_]+$/),
            label: z.string().min(1),
            match: z.union([z.literal('all'), z.array(z.string())]).default([]),
            matchIds: z.array(z.string()).default([]),
            matchPrefixes: z.array(z.string()).default([]),
          })
        )
        .min(1),
    })
    .optional(),
});

export type BalanceConfig = z.infer<typeof BalanceSchema>;

// Action schema
export const ActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  energy: z.number().int(),
  category: z.enum(['study', 'work', 'freelance', 'rest', 'social', 'career']),
});

export const ActionsFileSchema = z.array(ActionSchema);

// Content manifest schema
export const ContentManifestSchema = z.object({
  version: z.string(),
  skills: z.string(),
  perks: z.string(),
  companies: z.string(),
  events: z.array(z.string()),
  items: z.string(),
  npcs: z.string(),
  achievements: z.string(),
  actions: z.string(),
  balance: z.string(),
});
// ---- Daily challenges ----

export const DailyChallengeRewardSchema = z.object({
  money: z.number().optional(),
  motivation: z.number().optional(),
  reputation: z.number().optional(),
});

export const DailyChallengeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  action: z.string().min(1),
  match: z.enum(['prefix', 'exact']).default('exact'),
  count: z.number().int().positive().default(1),
  description: z.string().min(1).max(120),
  reward: DailyChallengeRewardSchema,
});

export const DailyChallengesFileSchema = z.array(DailyChallengeSchema).min(1);

// ---- Freelance projects with deadlines (reference 1.png «Работа») ----

export const ProjectTaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1).max(80),
  xp: z.number().int().positive().max(100),
  energy: z.number().int().min(0).max(10),
});

export const ProjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(120).default(''),
  icon: z.string().min(1),
  payment: z.number().int().positive(),
  reputation: z.number().int().min(0).max(20),
  deadlineDays: z.number().int().min(1).max(60),
  minSkillLevel: z.number().int().min(0).max(100),
  tasks: z.array(ProjectTaskSchema).min(2).max(6),
});

export const ProjectsFileSchema = z.object({
  version: z.number().int().default(1),
  projects: z.array(ProjectSchema).min(1),
});

// ---- Weekly season sprint (P1.2) ----
// Real-time weekly sprint: one theme rotates in every Monday (UTC+3); its goals
// count matching actions (by action-id prefix) done during that real week.

export const SprintGoalSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  /** action-id prefix this goal counts, e.g. 'study_' or 'freelance' */
  prefix: z.string().min(1),
  count: z.number().int().positive(),
  /** human line, e.g. «учебных действий» (used in «8 из 12 …») */
  description: z.string().min(1).max(120),
});

export const SprintThemeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(140).default(''),
  /** a PixelIcon name the client knows */
  icon: z.string().min(1),
  goals: z.array(SprintGoalSchema).min(1).max(4),
  reward: DailyChallengeRewardSchema,
});

export const SprintsFileSchema = z.object({
  version: z.number().int().default(1),
  /** rotating weekly themes; index = real UTC+3 week number % themes.length */
  themes: z.array(SprintThemeSchema).min(1),
});

// ---- Archetype builds (P1.3) ----
// Curated routes through the skill galaxy: an ordered chain of (skill, level)
// milestones; walking it unlocks a one-time-per-life bonus (see engine/archetypes).

export const ArchetypeStepSchema = z.object({
  skillId: z.string().regex(/^[a-z0-9_]+$/),
  level: z.number().int().min(1).max(100),
});

export const ArchetypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(200).default(''),
  nodes: z.array(ArchetypeStepSchema).min(2).max(6),
  reward: DailyChallengeRewardSchema,
});

export const ArchetypesFileSchema = z.object({
  version: z.number().int().default(1),
  archetypes: z.array(ArchetypeSchema).min(1),
});

// ---- Interview questions (gamified learning) ----

export const InterviewQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  skillId: z.string().regex(/^[a-z0-9_]+$/),
  tier: z.enum(['junior', 'middle', 'senior']),
  text: z.string().min(5).max(200),
  options: z.array(z.string().min(1)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5).max(300),
});

export const InterviewQuestionsFileSchema = z.array(InterviewQuestionSchema).min(3);

// ---- Monetization (Telegram Stars) ----

/**
 * What a product gives the player. Deliberately narrow: cosmetics, banked days
 * and badges only — see `content/monetization.json.policy` (no pay-to-win).
 */
export const ProductGrantsSchema = z.object({
  /** extra days added to the offline energy bank (still capped at bank capacity) */
  bankedDays: z.number().int().min(0).max(7).optional(),
  /** bank slots purchased: +1 to the bank capacity each (policy: «слоты банка дней») */
  bankSlots: z.number().int().min(1).max(1).optional(),
  /** avatar/room layer ids unlocked forever */
  cosmetics: z.array(z.string().min(1)).optional(),
  /** profile badge id */
  badge: z.string().min(1).optional(),
});

export const ProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** price in Telegram Stars (XTR) */
  stars: z.number().int().min(1).max(100000),
  /** can be bought more than once */
  repeatable: z.boolean().default(false),
  /** per-day purchase cap for repeatable products */
  dailyLimit: z.number().int().min(1).optional(),
  /** lifetime purchase cap (e.g. at most 3 bank slots ever) */
  totalLimit: z.number().int().min(1).optional(),
  /** витринная метка: как показывать позицию в каталоге (механики не меняет) */
  tag: z.enum(['support', 'utility', 'cosmetic', 'seasonal']).optional(),
  grants: ProductGrantsSchema,
});

export const MonetizationSchema = z.object({
  currency: z.literal('XTR').default('XTR'),
  policy: z.string().optional(),
  products: z.array(ProductSchema).min(1),
});

export type Product = z.infer<typeof ProductSchema>;
export type ProductGrants = z.infer<typeof ProductGrantsSchema>;
export type MonetizationConfig = z.infer<typeof MonetizationSchema>;

// ---- Торговая площадка редких питомцев (роадмап «Деньги и рост») ----

export const MarketplaceOfferSchema = z.object({
  /** id предмета из items.json (type:'pet', rarity rare/legendary) */
  itemId: z.string().regex(/^[a-z0-9_]+$/),
  /** вес выпадения в ежедневной подборке */
  weight: z.number().int().positive(),
});

export const MarketplaceSchema = z.object({
  /** сколько листингов показывать в подборке дня */
  listingsPerDay: z.number().int().min(1).max(10),
  pool: z.array(MarketplaceOfferSchema).min(1),
});

export type MarketplaceOffer = z.infer<typeof MarketplaceOfferSchema>;
export type MarketplaceConfig = z.infer<typeof MarketplaceSchema>;
