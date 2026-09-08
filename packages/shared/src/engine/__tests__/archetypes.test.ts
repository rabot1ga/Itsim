import { describe, it, expect } from 'vitest';
import {
  archetypeStepDone,
  archetypeNextStep,
  archetypeDone,
  archetypeClaimable,
  archetypeToView,
  newlyClaimableArchetypes,
  validateArchetypeClaim,
  type ArchetypeDef,
} from '../archetypes';

/** The frontend route used in content (levels mirror unlock gates: js→react needs js25, etc.) */
const FRONTEND: ArchetypeDef = {
  id: 'frontend',
  title: 'Путь фронтендера',
  reward: { money: 20000, reputation: 1 },
  nodes: [
    { skillId: 'javascript', level: 30 },
    { skillId: 'typescript', level: 20 },
    { skillId: 'react', level: 30 },
    { skillId: 'nextjs', level: 10 },
  ],
};

const ML: ArchetypeDef = {
  id: 'ml',
  title: 'ML-инженер',
  reward: { money: 20000 },
  nodes: [
    { skillId: 'python', level: 30 },
    { skillId: 'machine_learning', level: 30 },
    { skillId: 'neural_networks', level: 15 },
  ],
};

const levels = (o: Record<string, number>) => o;

describe('archetype steps', () => {
  it('a step is done when the skill reached the target level', () => {
    expect(archetypeStepDone(FRONTEND.nodes[0], levels({ javascript: 30 }))).toBe(true);
    expect(archetypeStepDone(FRONTEND.nodes[0], levels({ javascript: 29 }))).toBe(false);
    expect(archetypeStepDone(FRONTEND.nodes[0], levels({}))).toBe(false);
  });

  it('next step is the first unfinished milestone', () => {
    expect(archetypeNextStep(FRONTEND, levels({}))).toBe(0);
    expect(archetypeNextStep(FRONTEND, levels({ javascript: 40 }))).toBe(1);
    expect(archetypeNextStep(FRONTEND, levels({ javascript: 40, typescript: 20, react: 30 }))).toBe(3);
    // all met → null
    const done = levels({ javascript: 30, typescript: 20, react: 30, nextjs: 12 });
    expect(archetypeNextStep(FRONTEND, done)).toBeNull();
    expect(archetypeDone(FRONTEND, done)).toBe(true);
  });

  it('steps may be met out of order — completion is just every level', () => {
    const done = levels({ javascript: 30, react: 30, nextjs: 10, typescript: 20 });
    expect(archetypeDone(FRONTEND, done)).toBe(true);
  });
});

describe('claimability', () => {
  it('only when finished and not claimed in this life', () => {
    const all = levels({ javascript: 30, typescript: 20, react: 30, nextjs: 10 });
    expect(archetypeClaimable(FRONTEND, all, undefined)).toBe(true);
    expect(archetypeClaimable(FRONTEND, all, [])).toBe(true);
    expect(archetypeClaimable(FRONTEND, all, ['frontend'])).toBe(false);
    expect(archetypeClaimable(FRONTEND, levels({ javascript: 30 }), [])).toBe(false);
  });
});

describe('view projection', () => {
  it('carries live levels, done flags and reward', () => {
    const v = archetypeToView(FRONTEND, levels({ javascript: 40, typescript: 10 }), ['other']);
    expect(v.allDone).toBe(false);
    expect(v.claimed).toBe(false);
    expect(v.steps[0]).toMatchObject({ skillId: 'javascript', target: 30, level: 40, done: true });
    expect(v.steps[1]).toMatchObject({ done: false });
    expect(v.reward).toEqual({ money: 20000, reputation: 1 });
  });

  it('resolves skill names through the nameOf callback', () => {
    const v = archetypeToView(FRONTEND, {}, [], (id) => (id === 'react' ? 'React' : id));
    expect(v.steps[2].skillName).toBe('React');
  });
});

describe('newlyClaimableArchetypes', () => {
  it('reports only archetypes that became claimable in this very action', () => {
    const defs = [FRONTEND, ML];
    // js 29→30 finishes nothing; only the second raise completes frontend's step 0… no wait
    const r0 = newlyClaimableArchetypes(defs, levels({ javascript: 29 }), levels({ javascript: 30 }), []);
    expect(r0).toEqual([]);
    // finishing ALL steps in one action is unrealistic; emulate two-pass: after levels done
    const r1 = newlyClaimableArchetypes(
      defs,
      levels({ javascript: 30, typescript: 20, react: 29 }),
      levels({ javascript: 30, typescript: 20, react: 30, nextjs: 10 }),
      []
    );
    expect(r1.map((d) => d.id)).toEqual(['frontend']);
    // already claimed this life → not reported again
    const r2 = newlyClaimableArchetypes(
      defs,
      levels({ javascript: 30, typescript: 20, react: 29 }),
      levels({ javascript: 30, typescript: 20, react: 30, nextjs: 10 }),
      ['frontend']
    );
    expect(r2).toEqual([]);
    // ml path not done by frontend levels
    const r3 = newlyClaimableArchetypes(
      defs,
      levels({ python: 30, machine_learning: 29 }),
      levels({ python: 30, machine_learning: 30, neural_networks: 15 }),
      []
    );
    expect(r3.map((d) => d.id)).toEqual(['ml']);
  });
});

describe('server-side claim validation', () => {
  const state = (skills: Record<string, number>, bonuses?: string[]) => ({
    skills: Object.fromEntries(Object.entries(skills).map(([k, lvl]) => [k, { level: lvl, xp: 0 }])),
    archetypeBonuses: bonuses,
  });

  it('accepts a legit claim', () => {
    const r = validateArchetypeClaim(
      [FRONTEND],
      'frontend',
      state({ javascript: 30, typescript: 20, react: 30, nextjs: 10 })
    );
    expect('def' in r && r.def.id).toBe('frontend');
  });

  it('rejects unknown / unfinished / double-claimed', () => {
    expect(validateArchetypeClaim([FRONTEND], 'nope', state({})).error).toBeTruthy();
    expect(validateArchetypeClaim([FRONTEND], 'frontend', state({ javascript: 30 })).error).toBeTruthy();
    expect(
      validateArchetypeClaim(
        [FRONTEND],
        'frontend',
        state({ javascript: 30, typescript: 20, react: 30, nextjs: 10 }, ['frontend'])
      ).error
    ).toBeTruthy();
  });

  it('works with no content and no skills', () => {
    expect(validateArchetypeClaim(undefined, 'frontend', state({})).error).toBeTruthy();
  });
});
