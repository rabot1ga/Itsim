import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Скины и позиции питомца в комнате (роадмап): `/pet-room` — косметика сейва.
 * Валидирует владельца (настоящие питомцы, не аксессуары) и якорь позиции.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-petroom-'));
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

async function petRoom(id: number, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/game/pet-room',
    headers: { authorization: tma(id) },
    payload: body,
  });
}

describe('POST /api/game/pet-room', () => {
  it('скин и позиция сохраняются; патч держит второе поле', async () => {
    await reset(601);
    await patch(601, { items: ['pet_cat', 'pet_bow'] });

    const res = await petRoom(601, { skin: 'pet_cat', position: 'window' });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.petRoom).toEqual({ skin: 'pet_cat', position: 'window' });

    // только позиция — skin остаётся
    const res2 = await petRoom(601, { position: 'bed' });
    expect(res2.json().state.petRoom).toEqual({ skin: 'pet_cat', position: 'bed' });
  });

  it('чужой/несуществующий скин и мусорная позиция — 400', async () => {
    await reset(602);
    await patch(602, { items: ['pet_bow'] });

    // не куплен
    expect((await petRoom(602, { skin: 'pet_cat' })).statusCode).toBe(400);
    // аксессуар — не питомец
    expect((await petRoom(602, { skin: 'pet_bow' })).statusCode).toBe(400);
    // мусорная позиция
    expect((await petRoom(602, { position: 'ceiling' })).statusCode).toBe(400);
  });

  it('skin: null прячет питомца', async () => {
    await reset(603);
    await patch(603, { items: ['pet_dog'] });
    await petRoom(603, { skin: 'pet_dog' });
    const res = await petRoom(603, { skin: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.petRoom.skin).toBeNull();
  });
});
