import { PlayerState } from '../types';
import { CURRENT_STATE_VERSION } from './migrations';

/**
 * Player creation and helpers
 */

/**
 * Create a new player state (fresh game start)
 */
export function createNewPlayer(): PlayerState {
  return {
    version: CURRENT_STATE_VERSION,

    currentDay: 1,
    grade: 'unemployed',
    money: 10000, // "подушка от родителей"
    health: 80,
    motivation: 50,
    energy: 10,
    maxEnergy: 10,
    reputation: 0,
    bankedDays: 0,

    skills: {},
    perks: [],
    softSkills: {
      communication: { level: 5, xp: 0 },
      english: { level: 10, xp: 0 },
      time_management: { level: 3, xp: 0 },
    },

    job: null,
    jobWarnings: 0,
    pendingOffers: [],
    currentApplication: null,

    housingLevel: 0,
    items: [],
    activeCourses: [],

    pendingEvents: [],
    eventHistory: {},
    recentEventTags: [],
    relationships: {},

    activeFreelance: null,
    activeProject: null,
    freelanceBid: null,

    achievements: [],

    totalActions: 0,
    daysSinceRegistration: 1,
    lastMotivationDrift: 0,
    burnoutDays: 0,
    lastPromotionDay: 0,
    ctoCooldownUntilDay: 0,
  };
}

/**
 * Get the "career level index" for grade comparison
 */
export function gradeToIndex(grade: string): number {
  const grades = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];
  const idx = grades.indexOf(grade);
  return idx >= 0 ? idx : 0;
}
