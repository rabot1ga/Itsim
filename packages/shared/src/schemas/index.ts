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
export const ItemEffectsSchema = z.object({
  energyBonus: z.number().int().optional(),
  healthBonus: z.number().int().optional(),
  motivationBonus: z.number().int().optional(),
  reputationBonus: z.number().int().optional(),
  xpBonus: z.number().optional(),
  energyCostChance: z.number().min(0).max(1).optional(),
  speedBonus: z.number().optional(),
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
      reputationBonus: z.number(),
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
      burnoutDays: z.number().int().min(1).default(7),
      brokeDaysToQuit: z.number().int().min(1).default(15),
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
// ---- Procedural generation & Solana (DESIGN.md) ----

export const TraitOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  weight: z.number().positive(),
  rarity: z.enum(['common', 'rare', 'legendary']).optional(),
});

export const TintPaletteEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  hue: z.number().min(0).max(360),
  sat: z.number().min(0).max(10).optional(),
  light: z.number().min(0).max(3).optional(),
  weight: z.number().positive().optional(),
});

export const GeneticsConfigSchema = z.object({
  version: z.string().default('1.0'),
  eyes: z.array(TraitOptionSchema).min(1),
  hairstyles: z.array(TraitOptionSchema).min(1),
  hairPalette: z.array(TintPaletteEntrySchema).min(1),
  skinTones: z.array(TintPaletteEntrySchema).min(1),
  beards: z.array(TraitOptionSchema).min(1),
  tops: z.array(TraitOptionSchema).min(1),
  accessories: z.array(TraitOptionSchema).min(1),
  windows: z.array(TraitOptionSchema).min(1),
  wallPalette: z.array(TintPaletteEntrySchema).min(1),
  decorOptions: z.array(TraitOptionSchema).min(1),
});

export const LayerEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  file: z.string().nullable(),
  weight: z.number().positive().optional(),
  rarity: z.enum(['common', 'rare', 'legendary']).optional(),
  excludeWith: z.array(z.string()).optional(),
});

export const LayerSlotSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  zOrder: z.number().int(),
  required: z.boolean().default(false),
  tintSlot: z.string().optional(),
  entries: z.array(LayerEntrySchema),
});

export const LayerManifestSchema = z.object({
  collection: z.enum(['avatar', 'room', 'office']),
  version: z.number().int().positive(),
  resolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  slots: z.array(LayerSlotSchema).min(1),
});

export const ActiveCrossBonusSchema = z.object({
  type: z.enum(['freelance_mult', 'energy', 'motivation']),
  value: z.number(),
});

export const CrossCollectionBonusSchema = z.object({
  collectionId: z.string().regex(/^[a-z0-9_]+$/),
  collectionName: z.string().min(1),
  nftType: z.enum(['skin', 'decor', 'pet']),
  layerId: z.string().regex(/^[a-z0-9_]+$/),
  bonuses: z.array(ActiveCrossBonusSchema),
});

export const CrossCollectionsSchema = z.object({
  version: z.string().default('1.0'),
  collections: z.array(CrossCollectionBonusSchema),
});

export const NftAttributeSchema = z.object({
  trait_type: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

export const NftMetadataSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string(),
  image: z.string(),
  attributes: z.array(NftAttributeSchema),
  properties: z.object({
    files: z.array(z.object({ uri: z.string(), type: z.string() })),
  }),
});

/** Solana base58 public key */
export const WalletAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Некорректный адрес кошелька Solana (base58)');

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

// ---- Pixel-art avatar (docs/pixel-art.md) ----

const PixelCategorySchema = z.enum(['face', 'eyes', 'mouth', 'hair', 'hat', 'clothing', 'accessory']);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb');

export const PixelDefSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  /** "palette#index", "palette#role" or "#rrggbb" — resolvability is checked by the validator */
  c: z.string().min(1),
});

export const PixelComponentSchema = z.object({
  category: PixelCategorySchema,
  label: z.string().min(1),
  anchor: z.object({ x: z.number().int(), y: z.number().int() }).default({ x: 0, y: 0 }),
  mirror: z.boolean().optional(),
  excludes: z.array(PixelCategorySchema).optional(),
  pixels: z.array(PixelDefSchema).default([]),
  tags: z.array(z.string()).optional(),
  extended: z.boolean().optional(),
});

export const PixelArtFileSchema = z.object({
  format: z.number().int().default(1),
  $schema: z.string().optional(),
  sourceChecksum: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  canvas: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  layout: z.object({
    eyes_y: z.number().int().min(0),
    mouth_y: z.number().int().min(0),
    symmetry_axis_x: z.number(),
    head: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  }),
  palettes: z.record(z.string(), z.array(HexColor)),
  layer_order: z.array(PixelCategorySchema),
  components: z.record(z.string(), PixelComponentSchema),
});

/** Authored form: components may use the `rows` shorthand instead of pixels */
export const PixelArtSourceFileSchema = PixelArtFileSchema.extend({
  components: z.record(
    z.string(),
    PixelComponentSchema.partial({ pixels: true }).extend({
      rows: z.array(z.string()).optional(),
      palettes: z.array(z.string()).optional(),
    })
  ),
});

export const PixelColorSchemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  palettes: z.record(z.string(), z.array(HexColor)),
  tags: z.array(z.string()).optional(),
  /** which genetic traits should get this recolor in-game */
  match: z
    .object({
      hairColor: z.array(z.string()).optional(),
      skinTone: z.array(z.string()).optional(),
    })
    .optional(),
});

export const PixelGeneratorConfigSchema = z.object({
  format: z.number().int().default(1),
  categories: z.array(
    z.object({
      category: PixelCategorySchema,
      required: z.boolean().default(false),
      noneId: z.string().optional(),
      variants: z.array(z.string().min(1)),
      weights: z.record(z.string(), z.number().min(0)).optional(),
    })
  ),
  colorSchemes: z.array(PixelColorSchemeSchema).default([]),
});

export type PixelArtFileInput = z.input<typeof PixelArtFileSchema>;

// ---- Monetization (Telegram Stars) ----

/**
 * What a product gives the player. Deliberately narrow: cosmetics, banked days
 * and badges only — see `content/monetization.json.policy` (no pay-to-win).
 */
export const ProductGrantsSchema = z.object({
  /** extra days added to the offline energy bank (still capped at 7) */
  bankedDays: z.number().int().min(0).max(7).optional(),
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
