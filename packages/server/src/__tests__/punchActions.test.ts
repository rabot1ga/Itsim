import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Punch IT (DESIGN-PUNCH §2/§7.1): сервер-истина слотов дня. Действия
 * тратят слоты, голод падает, ночь добивает голодовкой.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-punch-'));
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

async function act(id: number, actionId: string, params?: Record<string, unknown>): Promise<any> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/action',
    headers: { authorization: tma(id) },
    payload: { actionId, params },
  });
  return res.json();
}

describe('слоты дня', () => {
  it('тренировка тратит слот и тянет голод', async () => {
    await reset(9201);
    await patch(9201, { money: 5000, energy: 10 });
    const r = await act(9201, 'train', { activity: 'gym' });
    expect(r.error).toBeUndefined();
    const state = (await loadState('9201')) as any;
    expect(state.slotsUsed).toBe(1);
    expect(state.hunger).toBeLessThan(70);
    expect(state.combat.power.xp + state.combat.power.level).toBeGreaterThan(5);
  });

  it('после 5 слотов — отказ «слоты кончились»', async () => {
    await reset(9202);
    await patch(9202, { slotsUsed: 5, money: 5000, energy: 10 });
    const r = await act(9202, 'rest', { activity: 'walk' });
    expect(r.error).toContain('Слоты');
    const trainR = await act(9202, 'train', { activity: 'run' });
    expect(trainR.error).toContain('Слоты');
  });

  it('еда не тратит слот, кормит', async () => {
    await reset(9203);
    await patch(9203, { money: 3000, hunger: 20 });
    const r = await act(9203, 'eat', { tier: 'fast' });
    expect(r.error).toBeUndefined();
    const state = (await loadState('9203')) as any;
    expect(state.slotsUsed ?? 0).toBe(0);
    expect(state.hunger).toBe(48);
    expect(state.money).toBe(2750);
  });

  it('смена на работе: 2 слота и дневная ставка', async () => {
    await reset(9204);
    await patch(9204, {
      job: {
        companyId: 'portal_2000',
        position: 'Junior',
        grade: 'junior',
        salary: 88000,
        energyPerDay: 2,
        daysWorked: 3,
        daysSinceLastPromotion: 0,
        companyCulture: 'friendly',
      },
    });
    const before = ((await loadState('9204')) as any).money as number;
    const r = await act(9204, 'work_shift');
    expect(r.error).toBeUndefined();
    const state = (await loadState('9204')) as any;
    expect(state.slotsUsed).toBe(2);
    expect(state.money - before).toBe(4000); // 88000/22 = 4000
  });

  it('смена без работы — отказ', async () => {
    await reset(9205);
    const r = await act(9205, 'work_shift');
    expect(r.error).toContain('работ');
  });

  it('advance-day: слоты обнуляются, голодовка бьёт по здоровью', async () => {
    await reset(9206);
    await patch(9206, { slotsUsed: 5, hunger: 2, health: 90 });
    const day = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(9206) },
    });
    expect(day.statusCode).toBe(200);
    const state = (await loadState('9206')) as any;
    expect(state.slotsUsed).toBe(0);
    expect(state.hunger).toBe(0);
    expect(state.health).toBeLessThan(90);
  });
});
