import { Grade } from '../types';

/**
 * Interview mini-game — gamified learning (spec: собеседование-квиз).
 *
 * The server draws questions for the player's skill branch and grade,
 * the player answers 3 questions, and the resulting answerScore feeds
 * the real interviewChance (0.4..1.0 → chance multiplier 0.9..1.2).
 */

export type InterviewTier = 'junior' | 'middle' | 'senior';

export interface InterviewQuestionDefinition {
  id: string;
  /** Hard skill id, or 'general' for soft/git questions */
  skillId: string;
  tier: InterviewTier;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const TIER_INDEX: Record<InterviewTier, number> = { junior: 0, middle: 1, senior: 2 };

/** Maximum question tier for a career grade */
export function gradeTier(grade: Grade): InterviewTier {
  if (grade === 'middle') return 'middle';
  if (grade === 'senior' || grade === 'teamlead' || grade === 'architect' || grade === 'cto') return 'senior';
  return 'junior';
}

/**
 * Draw `count` questions for the player's main skill and grade tier.
 * Topic-first: questions for the main skill come first (shuffled),
 * then the rest of the tier pool — so the interview is «по теме»,
 * with variety only when the branch has too few questions.
 * Deterministic for a given rng.
 */
export function pickInterviewQuestions(
  defs: InterviewQuestionDefinition[],
  opts: { mainSkillId: string; grade: Grade; count: number; rng: () => number }
): InterviewQuestionDefinition[] {
  const maxTier = TIER_INDEX[gradeTier(opts.grade)];

  const tierPool = defs.filter((q) => TIER_INDEX[q.tier] <= maxTier);
  const main = tierPool.filter((q) => q.skillId === opts.mainSkillId);
  const others = tierPool.filter((q) => q.skillId !== opts.mainSkillId);

  const shuffledMain = [...main].sort(() => opts.rng() - 0.5);
  const shuffledOthers = [...others].sort(() => opts.rng() - 0.5);

  return [...shuffledMain, ...shuffledOthers].slice(0, opts.count);
}

/**
 * Answer score 0.4..1.0 — feeds interviewChance as a multiplier.
 * 0 correct → 0.4 (hurt), all correct → 1.0 (boost).
 */
export function interviewAnswerScore(correct: number, total: number): number {
  if (total <= 0) return 0.4;
  return 0.4 + 0.6 * (correct / total);
}

/** Learning XP per question: correct answers teach more, mistakes still teach */
export function interviewXpForQuestion(correct: boolean): number {
  return correct ? 3 : 2;
}
