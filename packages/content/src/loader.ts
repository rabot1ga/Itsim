/**
 * @itsim/content — the content package as code-addressable data.
 *
 * All game content lives in this package as JSON. This module is the ONE place
 * that knows how to read it from disk, validate it against the Zod schemas from
 * `@itsim/shared` and cross-check references between files.
 *
 * It is consumed by:
 *   - `packages/server` (validates at startup, serves it to the client),
 *   - `npm run validate -w packages/content` (CI gate, see .github/workflows/ci.yml),
 *   - tests.
 *
 * The loader never throws on invalid content: it returns a structured issue list
 * so that callers can decide the policy (server = fail on error, CLI = fail on
 * error, `--strict` = fail on warnings too).
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  EventsFileSchema,
  SkillsFileSchema,
  PerksFileSchema,
  CompaniesFileSchema,
  NPCsFileSchema,
  ItemsFileSchema,
  AchievementsFileSchema,
  BalanceSchema,
  DailyChallengesFileSchema,
  InterviewQuestionsFileSchema,
  SprintsFileSchema,
  ProjectsFileSchema,
  ArchetypesFileSchema,
  MonetizationSchema,
  GRADE_ORDER,
} from '@itsim/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** packages/content — same depth from `src/` (tsx) and `dist/` (compiled). */
export const CONTENT_DIR = join(__dirname, '..');

export type IssueLevel = 'error' | 'warning';

export interface ContentIssue {
  level: IssueLevel;
  /** file or logical location, e.g. `events/events_work.json` or `balance.careerGates` */
  where: string;
  message: string;
}

export interface ContentBundle {
  events: any[];
  skills: any[];
  perks: any[];
  companies: any[];
  npcs: any[];
  items: any[];
  achievements: any[];
  balance: any;
  challenges: any[];
  interviewQuestions: any[];
  /** Telegram Stars catalogue */
  monetization: any;
  /** freelance projects with deadlines — { projects: [...] } */
  projects: any;
  /** weekly season sprints (P1.2) — { themes: [...] } */
  sprints: any;
  /** archetype builds (P1.3) — { archetypes: [...] } */
  archetypes: any;
  /** Pixel-art avatar pack (docs/pixel-art.md). null = not generated yet. */
}

export interface ContentLoadResult {
  bundle: ContentBundle;
  issues: ContentIssue[];
  stats: Record<string, number>;
}

export class ContentValidationError extends Error {
  constructor(public readonly issues: ContentIssue[]) {
    const errors = issues.filter((i) => i.level === 'error');
    super(
      `Content validation failed (${errors.length} error(s)):\n` +
        errors.map((i) => `  ✗ ${i.where}: ${i.message}`).join('\n')
    );
    this.name = 'ContentValidationError';
  }
}


/**
 * Read + validate every content file. Pure with respect to the process: no
 * console output, no throwing — everything ends up in `issues`.
 */
export function loadContentBundle(dir: string = CONTENT_DIR): ContentLoadResult {
  const issues: ContentIssue[] = [];

  const read = (file: string): any | null => {
    const path = join(dir, file);
    if (!existsSync(path)) {
      issues.push({ level: 'error', where: file, message: 'file not found' });
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch (err) {
      issues.push({ level: 'error', where: file, message: `invalid JSON: ${(err as Error).message}` });
      return null;
    }
  };

  const validate = <T>(file: string, schema: any, raw: any, fallback: T): T => {
    if (raw === null) return fallback;
    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ level: 'error', where: file, message: `${issue.path.join('.') || '<root>'}: ${issue.message}` });
      }
      return fallback;
    }
    return result.data as T;
  };

  const bundle: ContentBundle = {
    events: validate('events/*.json', EventsFileSchema, readEventFiles(dir, issues), []),
    skills: validate('skills.json', SkillsFileSchema, read('skills.json'), []),
    perks: validate('perks.json', PerksFileSchema, read('perks.json'), []),
    companies: validate('companies.json', CompaniesFileSchema, read('companies.json'), []),
    npcs: validate('npcs.json', NPCsFileSchema, read('npcs.json'), []),
    items: validate('items.json', ItemsFileSchema, read('items.json'), []),
    achievements: validate('achievements.json', AchievementsFileSchema, read('achievements.json'), []),
    balance: validate('balance.json', BalanceSchema, read('balance.json'), {} as any),
    challenges: validate('challenges.json', DailyChallengesFileSchema, read('challenges.json'), []),
    interviewQuestions: validate(
      'interview_questions.json',
      InterviewQuestionsFileSchema,
      read('interview_questions.json'),
      []
    ),
    monetization: validate('monetization.json', MonetizationSchema, read('monetization.json'), {
      currency: 'XTR',
      products: [],
    }),
    projects: validate('projects.json', ProjectsFileSchema, read('projects.json'), { projects: [] }),
    sprints: validate('sprints.json', SprintsFileSchema, read('sprints.json'), { themes: [] }),
    archetypes: validate('archetypes.json', ArchetypesFileSchema, read('archetypes.json'), { archetypes: [] }),
  };

  crossValidate(bundle, issues);

  const stats: Record<string, number> = {
    events: bundle.events.length,
    skills: bundle.skills.length,
    perks: bundle.perks.length,
    companies: bundle.companies.length,
    npcs: bundle.npcs.length,
    items: bundle.items.length,
    achievements: bundle.achievements.length,
    challenges: bundle.challenges.length,
    interviewQuestions: bundle.interviewQuestions.length,
    products: bundle.monetization?.products?.length ?? 0,
    careerGates: bundle.balance?.careerGates?.length ?? 0,
    sprintThemes: bundle.sprints?.themes?.length ?? 0,
    projects: bundle.projects?.projects?.length ?? 0,
    archetypes: bundle.archetypes?.archetypes?.length ?? 0,
  };

  return { bundle, issues, stats };
}

/**
 * Convenience wrapper for runtime consumers (server): throws on errors.
 */
export function loadContentOrThrow(dir: string = CONTENT_DIR): ContentLoadResult {
  const result = loadContentBundle(dir);
  if (result.issues.some((i) => i.level === 'error')) {
    throw new ContentValidationError(result.issues);
  }
  return result;
}

function readEventFiles(dir: string, issues: ContentIssue[]): any[] {
  const eventsDir = join(dir, 'events');
  if (!existsSync(eventsDir)) {
    issues.push({ level: 'error', where: 'events/', message: 'events directory not found' });
    return [];
  }
  const all: any[] = [];
  for (const file of readdirSync(eventsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    let data: any;
    try {
      data = JSON.parse(readFileSync(join(eventsDir, file), 'utf-8'));
    } catch (err) {
      issues.push({ level: 'error', where: `events/${file}`, message: `invalid JSON: ${(err as Error).message}` });
      continue;
    }
    if (!Array.isArray(data)) {
      issues.push({ level: 'error', where: `events/${file}`, message: 'expected an array of events' });
      continue;
    }
    all.push(...data);
  }
  return all;
}

/**
 * Pixel-art avatars are a build artifact of `npm run pixelgen:compile`, so a
 * missing pack must not brick the server — but a *present* pack must validate,
 * because the client renders from it verbatim.
 */

/**
 * Cross-file references. Historically these were silent `console.warn`s that
 * nobody read — now they are issues and CI fails the build on `error`.
 */
function crossValidate(bundle: ContentBundle, issues: ContentIssue[]) {
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });

  const skillIds = new Set(bundle.skills.map((s: any) => s.id));
  const eventIds = new Set<string>();
  const npcIds = new Set(bundle.npcs.map((n: any) => n.id));
  const itemIds = new Set(bundle.items.map((i: any) => i.id));

  // Soft skills live in PlayerState.softSkills and are valid event targets
  const softSkillIds = new Set([
    'communication',
    'english',
    'time_management',
    'leadership',
    'stress_resistance',
    'public_speaking',
  ]);

  // --- duplicate ids across every collection -------------------------------
  const dupCheck = (where: string, rows: any[]) => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row?.id) continue;
      if (seen.has(row.id)) err(where, `duplicate id "${row.id}"`);
      seen.add(row.id);
    }
    return seen;
  };
  for (const id of dupCheck('events/*.json', bundle.events)) eventIds.add(id);
  dupCheck('skills.json', bundle.skills);
  dupCheck('items.json', bundle.items);
  dupCheck('perks.json', bundle.perks);
  dupCheck('npcs.json', bundle.npcs);
  dupCheck('companies.json', bundle.companies);
  dupCheck('achievements.json', bundle.achievements);
  dupCheck('challenges.json', bundle.challenges);
  dupCheck('interview_questions.json', bundle.interviewQuestions);
  dupCheck('sprints.json', bundle.sprints?.themes ?? []);
  dupCheck('archetypes.json', bundle.archetypes?.archetypes ?? []);

  // --- archetype routes: skills must exist and each milestone must be
  // --- reachable from the milestones before it (or be a root skill)
  for (const arch of bundle.archetypes?.archetypes ?? []) {
    const provided = new Map<string, number>();
    for (const step of arch.nodes ?? []) {
      const skill = bundle.skills.find((sk: any) => sk.id === step.skillId);
      if (!skill) {
        err('archetypes.json', `archetype "${arch.id}": unknown skill "${step.skillId}"`);
        continue;
      }
      const unlockAt = skill.unlockAt ?? {};
      for (const [parent, need] of Object.entries(unlockAt)) {
        if (typeof need !== 'number' || !Number.isFinite(need) || (provided.get(parent) ?? 0) < need) {
          err(
            'archetypes.json',
            `archetype "${arch.id}": step ${step.skillId} needs ${parent} ${need}, but the route never provides it before this step`
          );
        }
      }
      provided.set(step.skillId, Math.max(provided.get(step.skillId) ?? 0, step.level));
    }
  }

  // --- events ---------------------------------------------------------------
  for (const event of bundle.events) {
    for (const choice of event.choices ?? []) {
      for (const skillId of Object.keys(choice.effects?.skill ?? {})) {
        if (!skillIds.has(skillId) && !softSkillIds.has(skillId)) {
          err(`events: ${event.id}`, `unknown skill "${skillId}" in choice effects`);
        }
      }
      for (const npcId of Object.keys(choice.effects?.relation ?? {})) {
        if (!npcIds.has(npcId)) err(`events: ${event.id}`, `unknown npc "${npcId}" in choice effects`);
      }
      if (choice.chain && !eventIds.has(choice.chain.eventId)) {
        err(`events: ${event.id}`, `chain references unknown event "${choice.chain.eventId}"`);
      }
      const grantedItem = choice.effects?.item;
      if (typeof grantedItem === 'string' && !itemIds.has(grantedItem)) {
        err(`events: ${event.id}`, `unknown item "${grantedItem}" in choice effects`);
      }
    }
    if (
      event.chainOnly &&
      ![...bundle.events].some((e) => (e.choices ?? []).some((c: any) => c.chain?.eventId === event.id))
    ) {
      warn(`events: ${event.id}`, 'chainOnly event is unreachable — no choice chains into it');
    }
  }

  // --- skills tree ----------------------------------------------------------
  for (const skill of bundle.skills) {
    if (skill.parent && !skillIds.has(skill.parent)) {
      err('skills.json', `skill "${skill.id}" has unknown parent "${skill.parent}"`);
    }
  }

  // --- interview questions --------------------------------------------------
  for (const q of bundle.interviewQuestions) {
    if (q.skillId !== 'general' && !skillIds.has(q.skillId)) {
      err('interview_questions.json', `question "${q.id}" references unknown skill "${q.skillId}"`);
    }
    if (Array.isArray(q.options) && (q.correctIndex < 0 || q.correctIndex >= q.options.length)) {
      err('interview_questions.json', `question "${q.id}": correctIndex out of range`);
    }
  }

  // --- career ladder --------------------------------------------------------
  const gates: any[] = bundle.balance?.careerGates ?? [];
  if (gates.length) {
    const order = GRADE_ORDER.filter((g) => g !== 'unemployed');
    const gateGrades = gates.map((g) => g.grade);
    const expected = order.filter((g) => gateGrades.includes(g));
    if (gateGrades.join(',') !== expected.join(',')) {
      err(
        'balance.careerGates',
        `gates must be ordered by grade (${expected.join(' → ')}), got ${gateGrades.join(' → ')}`
      );
    }
    for (let i = 1; i < gates.length; i++) {
      const prev = gates[i - 1];
      const cur = gates[i];
      for (const key of ['mainSkillDepth', 'branchTotal', 'totalLevels', 'rep'] as const) {
        if (typeof prev[key] === 'number' && typeof cur[key] === 'number' && cur[key] < prev[key]) {
          err(
            'balance.careerGates',
            `${cur.grade}.${key} (${cur[key]}) is lower than ${prev.grade}.${key} (${prev[key]}) — the ladder must be monotonic`
          );
        }
      }
    }
    for (const skillId of gates.map((g) => g.mainSkill).filter(Boolean)) {
      if (!skillIds.has(skillId)) err('balance.careerGates', `unknown mainSkill "${skillId}"`);
    }
  } else {
    warn('balance.careerGates', 'no career gates in balance.json — the server falls back to the legacy table');
  }

  // --- achievements / challenges --------------------------------------------
  for (const ch of bundle.challenges) {
    if (ch.actionId && typeof ch.actionId !== 'string')
      err('challenges.json', `challenge "${ch.id}": actionId must be a string`);
  }

  // --- projects: unique ids, unique task ids, sane deadline pacing ----------
  const projectIds = new Set<string>();
  for (const project of bundle.projects?.projects ?? []) {
    if (projectIds.has(project.id)) err('projects.json', `duplicate project id "${project.id}"`);
    projectIds.add(project.id);
    const taskIds = new Set<string>();
    for (const task of project.tasks) {
      if (taskIds.has(task.id)) err('projects.json', `project "${project.id}": duplicate task "${task.id}"`);
      taskIds.add(task.id);
    }
    // One task per day is the fastest honest pace; a deadline below that is a trap.
    if (project.deadlineDays < project.tasks.length) {
      err('projects.json', `project "${project.id}": deadline ${project.deadlineDays} d is shorter than ${project.tasks.length} tasks`);
    }
  }

  // --- monetization ---------------------------------------------------------
  const productIds = new Set<string>();
  for (const product of bundle.monetization?.products ?? []) {
    if (productIds.has(product.id)) err('monetization.json', `duplicate product id "${product.id}"`);
    productIds.add(product.id);
    if (!product.repeatable && product.dailyLimit) {
      warn('monetization.json', `product "${product.id}": dailyLimit is meaningless for a one-off product`);
    }
    // Hard policy check: the schema allows only cosmetics/bankedDays/badges,
    // but a future field must not sneak past review.
    for (const key of Object.keys(product.grants ?? {})) {
      if (!['bankedDays', 'cosmetics', 'badge'].includes(key)) {
        err('monetization.json', `product "${product.id}" grants "${key}" — pay-to-win is not allowed (see policy)`);
      }
    }
  }

  // --- perks ----------------------------------------------------------------
  for (const perk of bundle.perks) {
    for (const skillId of Object.keys(perk.requirements?.skills ?? {})) {
      if (!skillIds.has(skillId) && !softSkillIds.has(skillId)) {
        err('perks.json', `perk "${perk.id}" requires unknown skill "${skillId}"`);
      }
    }
  }
}
