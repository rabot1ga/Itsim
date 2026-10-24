import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Финал «Ушёл из IT»: цепочка brokeDays растёт только когда держатся оба
 * условия — «без денег» И «без работы» (24.10.2026, чинка противоречия:
 * раньше счётчик шёл и с работой, финал вспыхивал в день увольнения, а
 * сообщение обещало «15 дней без денег и без работы»).
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-left-it-'));
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

describe('«Ушёл из IT»: brokeDays копит только «без денег и без работы»', () => {
  it('без работы и без денег 15 дней — финал, счётчик и сообщение совпадают', async () => {
    await reset(750);
    await patch(750, { money: 0, job: null });

    let messages: string[] = [];
    for (let i = 0; i < 15; i += 1) messages = await advance(750);

    const state = (await loadState('750')) as any;
    expect(state.brokeDays).toBe(15);
    expect(state.careerEnding).toBe('left_it');
    expect(messages.join('\n')).toContain('15 дней без денег и без работы');
  });

  it('с работой даже в минусе цепочка не растёт (и финала нет)', async () => {
    await reset(751);
    await patch(751, {
      money: -5000,
      job: { company: 'ООО Ромашка', position: 'Junior', salary: 10000, grade: 'junior' },
    });

    for (let i = 0; i < 20; i += 1) await advance(751);

    const state = (await loadState('751')) as any;
    expect(state.brokeDays).toBe(0);
    expect(state.careerEnding).toBeUndefined();
  });

  it('деньги или работа обрывают цепочку', async () => {
    await reset(752);
    await patch(752, { money: 0, job: null });
    for (let i = 0; i < 10; i += 1) await advance(752);
    expect(((await loadState('752')) as any).brokeDays).toBe(10);

    // появились деньги — счётчик сброшен
    await patch(752, { money: 5000 });
    await advance(752);
    expect(((await loadState('752')) as any).brokeDays).toBe(0);

    // снова без денег, но уже с работой — не копится
    await patch(752, { money: 0, job: { company: 'X', position: 'Junior', salary: 10000, grade: 'junior' } });
    await advance(752);
    await advance(752);
    expect(((await loadState('752')) as any).brokeDays).toBe(0);
    expect(((await loadState('752')) as any).careerEnding).toBeUndefined();
  });
});
