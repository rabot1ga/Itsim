import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadContentOrThrow } from '@itsim/content';
import { checkEndings, createNewPlayer } from '@itsim/shared';
import { HUMAN_REQ, GRADE_POSITIONS } from '../routes/game/shared.js';

/**
 * CTO как должность, а не как финал (В2, принято 22.10.2026 —
 * docs/PROPOSALS-2026-09-27-endgame.md).
 *
 * До этой правки победа на выборах борда в тот же день ставила
 * `careerEnding = 'corporate_god'`, и «жизни после CTO» в сейве просто не
 * существовало: `claim_ending` отвечал «Финал уже зафиксирован», а
 * `canStartNewLife` открывался именно потому, что жизнь закончилась. Здесь
 * проверяются три новых правила, а не тексты сообщений:
 *
 *   1. выборы дают кресло и день избрания, но НЕ финал;
 *   2. финал открывается, когда кресло удержано `endings.cto.minDaysAsCto` дней;
 *   3. потеря работы отбирает кресло: срок обнуляется, грейд — снова архитектор
 *      (иначе уволенный CTO не мог бы ни переизбраться, ни вырасти — тупик).
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-cto-'));
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

const { bundle } = loadContentOrThrow();
const BALANCE = (bundle as any).balance;
const HOLD_DAYS = BALANCE.endings.cto.minDaysAsCto;
const ELECTION_INTERVAL = BALANCE.careerGates.find((g: any) => g.grade === 'cto')?.electionIntervalDays ?? 90;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Кандидат, который проходит гейт CTO с запасом (skill 85/80, total 125/122). */
function architect(overrides: Record<string, any> = {}): any {
  return {
    ...createNewPlayer(),
    telegramId: 'tg:1',
    firstName: 'Tester',
    lastTickAt: 0,
    ratingScore: 0,
    activeEventId: null,
    freelanceDoneToday: false,
    lastFreelanceDay: 0,
    sideJobDoneToday: false,
    petFedToday: false,
    mainSkillId: 'javascript',
    currentDay: 300,
    grade: 'architect',
    reputation: 75,
    motivation: 60,
    health: 80,
    money: 5_000_000,
    energy: 10,
    maxEnergy: 10,
    skills: {
      javascript: { level: 85, xp: 0 },
      react: { level: 20, xp: 0 },
      typescript: { level: 20, xp: 0 },
    },
    softSkills: {
      communication: { level: 70, xp: 0 },
      english: { level: 40, xp: 0 },
      leadership: { level: 40, xp: 0 },
      time_management: { level: 5, xp: 0 },
    },
    job: {
      companyId: 'corporation_of_everything',
      position: 'Архитектор',
      grade: 'architect',
      salary: 700_000,
      energyPerDay: 4,
      daysWorked: 400,
      daysSinceLastPromotion: 200,
    },
    ctoCooldownUntilDay: 0,
    ...overrides,
  };
}

async function modules(roll?: number) {
  vi.resetModules();
  process.env.DATA_DIR = DATA_DIR;
  const shared = await import('../routes/game/shared');
  // Сейм серверного RNG (P2.4): фиксируем бросок явно, без моков Math.random.
  if (roll !== undefined) shared.__setRngFactoryForTests(() => () => roll);
  return {
    ending: await import('../routes/game/ending'),
    day: await import('../routes/game/day'),
    // тот же инстанс lib/i18n, что и у роутов (resetModules) — ALS общая
    i18n: await import('../lib/i18n.js'),
  };
}

const ctoEnding = (state: any) => checkEndings(state, BALANCE).find((e) => e.id === 'cto')!;

describe('CTO: выборы дают должность, а не финал', () => {
  it('победа ставит грейд, кресло и день избрания — но не careerEnding', async () => {
    const { ending } = await modules(0);
    // фиксированный бросок серверного RNG // шанс ≥ 0.15 — всегда победа
    const state = architect();

    const res = ending.runCtoElection(state, bundle);

    expect(res.error).toBeUndefined();
    expect(state.grade).toBe('cto');
    expect(state.job.grade).toBe('cto');
    expect(state.job.position).toBe('CTO');
    expect(state.ctoSinceDay).toBe(300);
    expect(state.lastPromotionDay).toBe(300);
    // главное отличие от прежней модели: жизнь не заканчивается в день выборов
    expect(state.careerEnding).toBeUndefined();
    expect(res.message).toMatch(new RegExp(`продержишься в кресле ${HOLD_DAYS} дн`));
  });

  it('в день победы финал ещё не доступен, а через 60 дней — доступен', async () => {
    const { ending } = await modules(0);
    // фиксированный бросок серверного RNG
    const state = architect();
    ending.runCtoElection(state, bundle);

    expect(ctoEnding(state).available).toBe(false);
    expect(ctoEnding(state).missing).toMatch(new RegExp(`Продержись в кресле ${HOLD_DAYS} дн\\. \\(сейчас 0\\)`));

    state.currentDay = 300 + HOLD_DAYS - 1;
    expect(ctoEnding(state).available).toBe(false);

    state.currentDay = 300 + HOLD_DAYS;
    expect(ctoEnding(state).available).toBe(true);
    expect(ctoEnding(state).missing).toBeUndefined();
  });

  it('проигрыш ставит кулдаун борда и не трогает срок', async () => {
    const { ending } = await modules(0.999);
    // фиксированный бросок серверного RNG // всегда провал
    const state = architect({ motivation: 60, reputation: 75 });

    const res = ending.runCtoElection(state, bundle);

    expect(res.error).toBeUndefined();
    expect(state.grade).toBe('architect');
    expect(state.ctoSinceDay).toBeUndefined();
    expect(state.careerEnding).toBeUndefined();
    expect(state.ctoCooldownUntilDay).toBe(300 + ELECTION_INTERVAL);
    expect(state.reputation).toBe(71); // −4
    expect(state.motivation).toBe(50); // −10
  });

  it('на выборы не пускают без работы, не-архитектора и во время кулдауна', async () => {
    const { ending } = await modules();
    expect(ending.runCtoElection(architect({ job: null }), bundle).error).toMatch(/большая компания/);
    expect(ending.runCtoElection(architect({ grade: 'senior' }), bundle).error).toMatch(/из архитекторов/);
    expect(ending.runCtoElection(architect({ ctoCooldownUntilDay: 400 }), bundle).error).toMatch(/100 дн/);
  });

  it('неквалифицированному кандидату борд отвечает списком того, чего не хватает', async () => {
    const { ending } = await modules();
    const res = ending.runCtoElection(architect({ reputation: 30 }), bundle);
    expect(res.error).toMatch(/Не хватает/);
  });
});

describe('CTO: потеря кресла', () => {
  it('увольнение возвращает архитектора и обнуляет срок — финал не «досиживается»', async () => {
    const { ending, day } = await modules(0);
    // фиксированный бросок серверного RNG
    const state = architect();
    ending.runCtoElection(state, bundle);
    expect(state.grade).toBe('cto');

    // 20 дней в кресле и три предупреждения: на следующем дне тебя увольняют
    state.currentDay += 20;
    state.jobWarnings = 3;
    const messages: string[] = [];
    day.advanceDay(state, bundle, messages);

    expect(state.job).toBeNull();
    expect(state.grade).toBe('architect');
    expect(state.ctoSinceDay).toBeUndefined();
    expect(state.careerEnding).toBeUndefined();
    expect(messages.join('\n')).toMatch(/кресло CTO занял кто-то другой/);
    // без работы финал CTO недостижим, сколько бы дней ни прошло
    state.currentDay += 500;
    expect(ctoEnding(state).available).toBe(false);
  });

  it('архитектора увольнение не разжалует и срок ему не придумает', async () => {
    const { day } = await modules(0);
    // фиксированный бросок серверного RNG
    const state = architect({ jobWarnings: 3 });
    const messages: string[] = [];
    day.advanceDay(state, bundle, messages);

    expect(state.job).toBeNull();
    expect(state.grade).toBe('architect');
    expect(state.ctoSinceDay).toBeUndefined();
    expect(messages.join('\n')).not.toMatch(/кресло CTO/);
  });
});

describe('CTO: порог удержания — контент, а не константа', () => {
  it('ctoHoldDays читает balance.endings.cto.minDaysAsCto', async () => {
    const { ending } = await modules();
    expect(ending.ctoHoldDays(bundle)).toBe(HOLD_DAYS);
    expect(HOLD_DAYS).toBe(60);
  });

  it('без контента возвращается тот же дефолт, что в движке', async () => {
    const { ending } = await modules();
    expect(ending.ctoHoldDays({})).toBe(60);
    expect(ending.ctoHoldDays({ balance: { endings: { cto: { minDaysAsCto: 'мес' } } } })).toBe(60);
    expect(ending.ctoHoldDays({ balance: { endings: { cto: { minDaysAsCto: 90 } } } })).toBe(90);
  });

  it('движок и сервер согласны: 59 дней — нет, 60 — да', async () => {
    const { ending } = await modules(0);
    // фиксированный бросок серверного RNG
    const state = architect();
    ending.runCtoElection(state, bundle);
    const hold = ending.ctoHoldDays(bundle);

    state.currentDay = 300 + hold - 1;
    expect(ctoEnding(state).available).toBe(false);
    state.currentDay = 300 + hold;
    expect(ctoEnding(state).available).toBe(true);
  });
});

describe('i18n (beta-gap): подписи требований CTO переводятся под язык запроса', () => {
  it('константы хранят сырые ключи — сервер их не замораживает в языке старта', () => {
    expect(HUMAN_REQ.rep).toBe('репутация');
    expect(GRADE_POSITIONS.senior).toBe('Senior-разработчик');
  });

  it('«{human}» собирается через t() на месте: EN-запрос видит EN-фрагменты', async () => {
    const { ending, i18n } = await modules(0);
    // репутации на гейт не хватает — в ответ уходит перечень «чего не хватает»
    const state = architect({ reputation: 5 });
    const res = i18n.runWithLocale('en', () => ending.runCtoElection(state, bundle));
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Missing:');
    expect(res.error).toContain('reputation:');
    expect(res.error).not.toContain('репутация');
  });
});
