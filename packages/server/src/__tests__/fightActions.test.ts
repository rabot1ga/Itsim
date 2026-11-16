import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Уличные бои (DESIGN-PUNCH §3/§4, арена 1): preview_fight находит соперника,
 * street_fight бьётся со ставкой, пишет лог в сейв и след в память мира.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-fight-'));
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
  const res = await app.inject({ method: 'POST', url: '/api/game/reset', headers: { authorization: tma(id) } });
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

describe('уличный бой', () => {
  it('preview_fight находит соперника; street_fight дерётся и пишет лог', async () => {
    await reset(9301);
    await patch(9301, {
      money: 5000,
      energy: 10,
      combat: { power: { level: 20, xp: 0 }, agility: { level: 20, xp: 0 }, speed: { level: 20, xp: 0 } },
    });
    const preview = await act(9301, 'preview_fight');
    expect(preview.error).toBeUndefined();
    let state = (await loadState('9301')) as any;
    expect(state.pendingFight?.name).toBeTruthy();

    const fight = await act(9301, 'street_fight', { stake: 500 });
    expect(fight.error).toBeUndefined();
    state = (await loadState('9301')) as any;
    expect(state.fightDoneToday).toBe(true);
    expect(state.lastFight?.log?.length).toBeGreaterThan(0);
    expect(state.pendingFight).toBeUndefined();
    // след в памяти мира
    expect(state.memories[0].kind).toBe('fight');
    // слот и энергия потрачены
    expect(state.slotsUsed).toBe(1);
    expect(state.energy).toBe(7);
  });

  it('повторный бой в тот же день — отказ', async () => {
    await reset(9302);
    await patch(9302, { money: 1000, energy: 10, fightDoneToday: true });
    const r = await act(9302, 'preview_fight');
    expect(r.error).toContain('уже дрался');
  });

  it('без соперника драться нельзя', async () => {
    await reset(9303);
    const r = await act(9303, 'street_fight', { stake: 0 });
    expect(r.error).toContain('соперника');
  });

  it('перк покупается с требованием стата', async () => {
    await reset(9304);
    await patch(9304, {
      money: 10000,
      combat: { power: { level: 5, xp: 0 }, agility: { level: 5, xp: 0 }, speed: { level: 5, xp: 0 } },
    });
    const denied = await act(9304, 'buy_style_perk', { perk: 'bear_hp' });
    expect(denied.error).toContain('Нужен стат');
    await patch(9304, {
      combat: { power: { level: 16, xp: 0 }, agility: { level: 5, xp: 0 }, speed: { level: 5, xp: 0 } },
    });
    const ok = await act(9304, 'buy_style_perk', { perk: 'bear_hp' });
    expect(ok.error).toBeUndefined();
    const state = (await loadState('9304')) as any;
    expect(state.stylePerks).toContain('bear_hp');
  });

  it('choose_style сменяет стиль', async () => {
    await reset(9305);
    const r = await act(9305, 'choose_style', { style: 'tiger' });
    expect(r.error).toBeUndefined();
    expect(((await loadState('9305')) as any).style).toBe('tiger');
    const bad = await act(9305, 'choose_style', { style: 'dragon' });
    expect(bad.error).toBeTruthy();
  });
});
