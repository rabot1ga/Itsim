import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Еда — настоящая потребность (24.10.2026): голодный день бьёт по здоровью
 * (а оно ограничивает мотивацию), цепочка голодных дней усиливает урон,
 * «Нормально поесть» обрывает цепочку и лечит.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-hunger-'));
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

async function advance(id: number): Promise<string[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/advance-day',
    headers: { authorization: tma(id) },
  });
  expect(res.statusCode).toBe(200);
  return (res.json().messages ?? []) as string[];
}

describe('голодный день', () => {
  it('без денег на еду: здоровье падает, счётчик растёт, сообщение видно каждый день', async () => {
    await reset(601);
    await patch(601, { money: 0, health: 80, motivation: 50 });

    const messages = await advance(601);
    expect(messages.join('\n')).toContain('На еду не хватило');

    const state = (await loadState('601')) as any;
    expect(state.hungryDays).toBe(1);
    expect(state.health).toBe(77); // −3 за голодный день
    expect(state.money).toBe(0);
  });

  it('три голодных дня подряд — истощение, урон усиливается', async () => {
    await reset(602);
    await patch(602, { money: 0, health: 80, motivation: 50 });

    await advance(602);
    await advance(602);
    const messages = await advance(602);
    expect(messages.join('\n')).toContain('истощение');

    const state = (await loadState('602')) as any;
    expect(state.hungryDays).toBe(3);
    expect(state.health).toBe(80 - 3 - 3 - (3 + 4)); // два дня по −3, третий −3−4
  });

  it('сытый день сбрасывает счётчик голодных дней', async () => {
    await reset(603);
    await patch(603, { money: 0, health: 80, motivation: 50, hungryDays: 2 });
    await advance(603);
    expect(((await loadState('603')) as any).hungryDays).toBe(3);

    await patch(603, { money: 50_000 });
    await advance(603);
    const state = (await loadState('603')) as any;
    expect(state.hungryDays).toBe(0);
  });
});

describe('🍲 Нормально поесть (rest_lunch)', () => {
  it('лечит и обрывает цепочку голодных дней', async () => {
    await reset(604);
    await patch(604, { money: 5_000, energy: 10, health: 60, motivation: 40, hungryDays: 3 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/action',
      headers: { authorization: tma(604) },
      payload: { actionId: 'rest_lunch' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toContain('Нормально поел');

    const state = (await loadState('604')) as any;
    expect(state.health).toBe(65); // +5
    expect(state.motivation).toBe(43); // +3
    expect(state.hungryDays).toBe(0);
    expect(state.money).toBe(5_000 - 700);
    expect(state.energy).toBe(9);
  });
});
