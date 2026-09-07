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

// ---- Player State ----

export interface PlayerState {
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

  // Procedural generation (DESIGN.md) — optional for backward compatibility
  walletAddress?: string;
  genetics?: GeneticTraits;
  crossBonuses?: ActiveCrossBonus[];

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

export type SkillBranch = 'frontend' | 'backend' | 'mobile' | 'qa' | 'devops' | 'ai_ml' | 'cybersec' | 'gamedev' | 'blockchain';

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
  /** Minted as cNFT/pNFT on purchase (DESIGN.md 3.2) */
  nft?: boolean;
  rarity?: TraitRarity;
  /** Layer id in the room/avatar manifest rendered when owned */
  layerId?: string;
}

export interface ItemEffects {
  energyBonus?: number;
  healthBonus?: number;
  motivationBonus?: number;
  reputationBonus?: number;
  xpBonus?: number; // percent
  energyCostChance?: number; // chance to reduce energy cost by 1
  speedBonus?: number;
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

export interface TraitOption {
  id: string;
  name: string;
  weight: number;
  rarity?: TraitRarity;
}

/** Tint entry for grayscale assets: hue (deg) + saturation + lightness */
export interface TintPaletteEntry {
  id: string;
  name: string;
  hue: number;
  sat?: number;
  light?: number;
  /** Optional weight for deterministic palette picking (default 1) */
  weight?: number;
}

export interface GeneticsConfig {
  version?: string;
  eyes: TraitOption[];
  hairstyles: TraitOption[];
  hairPalette: TintPaletteEntry[];
  skinTones: TintPaletteEntry[];
  beards: TraitOption[];
  tops: TraitOption[];
  accessories: TraitOption[];
  windows: TraitOption[];
  wallPalette: TintPaletteEntry[];
  decorOptions: TraitOption[];
}

/** Deterministic "genotype" derived from the player seed */
export interface GeneticTraits {
  seed: string;
  skinTone: string;
  eyeShape: string;
  hairStyle: string;
  hairColor: string;
  beard: string;
  top: string;
  accessory: string;
  windowShape: string;
  wallColor: string;
  decor: string;
}

// ---- Layer manifests (HashLips-style) ----

export interface LayerEntry {
  id: string;
  file: string | null; // null = "no layer" option
  weight?: number;
  rarity?: TraitRarity;
  /** Exclusions: "slotId.optionId" pairs that this entry must not be combined with */
  excludeWith?: string[];
}

export interface LayerSlot {
  id: string;
  zOrder: number;
  required: boolean;
  /** Slot id of the palette used to tint this layer (e.g. "wallColor") */
  tintSlot?: string;
  entries: LayerEntry[];
}

export interface LayerManifest {
  collection: 'avatar' | 'room';
  version: number;
  resolution: { width: number; height: number };
  slots: LayerSlot[];
}

// ---- Solana / NFT (DESIGN.md section 3) ----

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftFile {
  uri: string;
  type: string;
}

/** Metaplex-style item metadata */
export interface NftMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: NftAttribute[];
  properties: { files: NftFile[] };
}

export interface CrossCollectionBonus {
  collectionId: string;
  collectionName: string;
  nftType: 'skin' | 'decor' | 'pet';
  layerId: string;
  bonuses: ActiveCrossBonus[];
}

export interface ActiveCrossBonus {
  type: 'freelance_mult' | 'energy' | 'motivation';
  value: number;
}

export interface CrossCollectionsConfig {
  collections: CrossCollectionBonus[];
}

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

// ---- Rating ----

export const MAX_CAREER_LEVEL = 7; // 0-7 grade index
export const TOTAL_ACHIEVEMENTS = 17;