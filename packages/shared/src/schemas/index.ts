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
  choices: z.array(EventChoiceSchema).min(2).max(4),
});

export const EventsFileSchema = z.array(EventSchema);

// Skill schema
export const SkillSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  branch: z.enum(['frontend', 'backend', 'mobile', 'qa', 'devops', 'ai_ml', 'cybersec']),
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
});

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  type: z.enum(['housing', 'pc', 'chair', 'headphones', 'coffee', 'course', 'other']),
  price: z.number().int().min(0),
  description: z.string(),
  effects: ItemEffectsSchema,
  icon: z.string(),
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
  xpSources: z.record(z.string(), z.object({
    xp: z.number(),
    energy: z.number(),
    cost: z.number().default(0),
    maxLevel: z.number().default(100),
  })),

  // Networking tuning (communication XP, reputation gain, energy cost)
  networking: z.object({
    commXp: z.number().default(5),
    repGain: z.number().default(0.5),
    energy: z.number().default(2),
  }).default({ commXp: 5, repGain: 0.5, energy: 2 }),

  // Event frequency
  eventChanceOnboarding: z.number().default(0.20),
  eventChanceEarly: z.number().default(0.35),
  eventChanceMid: z.number().default(0.28),
  eventChanceLate: z.number().default(0.20),

  // Housing
  housing: z.array(z.object({
    level: z.number(),
    name: z.string(),
    cost: z.number(),
    energyBonus: z.number(),
    motivationBonus: z.number(),
    reputationBonus: z.number(),
  })),
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