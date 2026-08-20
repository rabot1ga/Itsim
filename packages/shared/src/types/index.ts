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

export type SkillBranch = 'frontend' | 'backend' | 'mobile' | 'qa' | 'devops' | 'ai_ml' | 'cybersec';

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
  choices: EventChoice[];
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
  type: 'housing' | 'pc' | 'chair' | 'headphones' | 'coffee' | 'course' | 'other';
  price: number;
  description: string;
  effects: ItemEffects;
  icon: string;
}

export interface ItemEffects {
  energyBonus?: number;
  healthBonus?: number;
  motivationBonus?: number;
  reputationBonus?: number;
  xpBonus?: number; // percent
  energyCostChance?: number; // chance to reduce energy cost by 1
  speedBonus?: number;
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

// ---- Rating ----

export const MAX_CAREER_LEVEL = 7; // 0-7 grade index
export const TOTAL_ACHIEVEMENTS = 15;