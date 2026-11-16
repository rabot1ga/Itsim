import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Модификаторы карт (DESIGN-DECK §7.3): новые варианты ответа, которые
 * открываются перком/предметом. Сервер — источник истины: без перка/предмета
 * действие отклоняется, даже если клиент как-то его показал.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-mods-'));
process.env.DATA_DIR = DATA_DIR;
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

let app: FastifyInstance;
let loadState: typeof import('../services/gameStore.js').loadState;
let saveState: typeof import('../services/gameStore.js').saveState;

beforeAll(async () => {
  const { loadContent } = await import('../services/contentService.js');
  loadContent();
  const store = await import('../services/gameStore.js');
  loadState = store.loadState;
  saveState = store.saveState;
  const { buildServer } = await import('../index.js');
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function tma(id: number): string {
  const initData = `user=${encodeURIComponent(JSON.stringify({ id, first_name: '', language_code: 'ru' }))}`;
  return `tma ${initData}`;
}

async function reset(id: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/reset',
    headers: { authorization: tma(id) },
  });
  expect(res.statusCode).toBe(200);
}

async function patch(id: number, over: Record<string, unknown>): Promise<void> {
  const state = (await loadState(String(id))) as Record<string, unknown>;
  Object.assign(state, over);
  await saveState(String(id), state as never);
}

async function act(
  id: number,
  actionId: string,
  params?: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/action',
    headers: { authorization: tma(id) },
    payload: { actionId, params },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

const JOB = { position: 'Middle', salary: 120_000, companyCulture: {}, daysWorked: 3 };

describe('delegate_task — перк «Наставник»', () => {
  it('без перка отклоняется', async () => {
    await reset(9001);
    await patch(9001, { job: { ...JOB }, energy: 10, mainSkillId: 'javascript' });
    const r = await act(9001, 'delegate_task');
    expect(r.statusCode).toBe(400);
    expect(String(r.body.error)).toContain('Наставник');
  });

  it('с перком: лидерство растёт, настроение не падает', async () => {
    await reset(9002);
    await patch(9002, {
      job: { ...JOB },
      energy: 10,
      mainSkillId: 'javascript',
      perks: ['perk_mentor'],
      motivation: 50,
      softSkills: { leadership: { level: 2, xp: 0 } },
    });
    const before = JSON.parse(JSON.stringify(await loadState('9002'))) as any;
    const r = await act(9002, 'delegate_task');
    expect(r.statusCode).toBe(200);
    const after = (await loadState('9002')) as any;
    const leadScore = (s: any) => s.softSkills.leadership.level * 10_000 + s.softSkills.leadership.xp;
    expect(leadScore(after)).toBeGreaterThan(leadScore(before));
    expect(after.motivation).toBeGreaterThanOrEqual(50);
    expect(after.money).toBeGreaterThan(before.money);
    expect(after.energy).toBe(10 - 4);
  });
});

describe('express_learn — перк «Скорочтение»', () => {
  it('без перка отклоняется', async () => {
    await reset(9003);
    await patch(9003, { energy: 10, mainSkillId: 'javascript' });
    const r = await act(9003, 'express_learn');
    expect(r.statusCode).toBe(400);
    expect(String(r.body.error)).toContain('Скорочтение');
  });

  it('с перком: +50% XP к базе книги, мотивация −2', async () => {
    await reset(9004);
    await patch(9004, {
      energy: 10,
      mainSkillId: 'javascript',
      perks: ['perk_speed_reader'],
      motivation: 50,
      skills: { javascript: { level: 1, xp: 0 } },
    });
    const r = await act(9004, 'express_learn');
    expect(r.statusCode).toBe(200);
    const after = (await loadState('9004')) as any;
    expect(after.skills.javascript.xp + after.skills.javascript.level * 8).toBeGreaterThanOrEqual(8);
    expect(after.motivation).toBe(48);
  });
});

describe('monetize_project — перк «Подработчик со стажем»', () => {
  it('без перка отклоняется, с перком приносит деньги', async () => {
    await reset(9005);
    await patch(9005, { energy: 10, mainSkillId: 'javascript', money: 1000 });
    const denied = await act(9005, 'monetize_project');
    expect(denied.statusCode).toBe(400);

    await patch(9005, { perks: ['perk_hustler'], energy: 10 });
    const ok = await act(9005, 'monetize_project');
    expect(ok.statusCode).toBe(200);
    const after = (await loadState('9005')) as any;
    expect(after.money).toBe(1000 + 9000);
    expect(after.energy).toBe(10 - 3);
  });
});

describe('morning_coffee — предмет «Кофемашина»', () => {
  it('без кофемашины отклоняется; с ней даёт энергию раз в день', async () => {
    await reset(9006);
    await patch(9006, { energy: 5, motivation: 50, items: [] });
    const denied = await act(9006, 'morning_coffee');
    expect(denied.statusCode).toBe(400);
    expect(String(denied.body.error)).toContain('кофемашин');

    await patch(9006, { items: ['coffee_maker'] });
    const ok = await act(9006, 'morning_coffee');
    expect(ok.statusCode).toBe(200);
    const mid = (await loadState('9006')) as any;
    expect(mid.energy).toBe(8);
    expect(mid.motivation).toBe(52);

    const again = await act(9006, 'morning_coffee');
    expect(again.statusCode).toBe(400);
    expect(String(again.body.error)).toContain('сегодня');
  });
});
