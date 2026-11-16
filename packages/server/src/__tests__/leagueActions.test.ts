import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Лиги и турниры (DESIGN-PUNCH §5/§6): боевой вечер лиги двигает сезон,
 * IT-турнир берёт взнос и платит приз, корпоративный закрыт до senior.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-league-'));
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

describe('лига', () => {
  it('боевой вечер двигает сезон: очки, слот, лог', async () => {
    await reset(9401);
    await patch(9401, {
      money: 20000,
      energy: 10,
      combat: { power: { level: 30, xp: 0 }, agility: { level: 30, xp: 0 }, speed: { level: 30, xp: 0 } },
    });
    const r = await act(9401, 'league_fight', { stake: 500 });
    expect(r.error).toBeUndefined();
    const state = (await loadState('9401')) as any;
    expect(state.league.slot).toBe(1);
    expect(state.league.points).toBeGreaterThanOrEqual(1);
    expect(state.lastFight?.log?.length).toBeGreaterThan(0);
    expect(state.leagueDoneToday).toBe(true);
    expect(state.memories[0].kind).toBe('fight');
  });

  it('повторный матч лиги в тот же день — отказ', async () => {
    await reset(9402);
    await patch(9402, { leagueDoneToday: true, energy: 10 });
    const r = await act(9402, 'league_fight');
    expect(r.error).toContain('уже был');
  });

  it('5-й матч запускает итог сезона (слот сбрасывается)', async () => {
    await reset(9403);
    await patch(9403, {
      money: 20000,
      energy: 10,
      league: { division: 'bronze', slot: 4, points: 8, wins: 2, losses: 2, season: 1, champion: false },
    });
    const r = await act(9403, 'league_fight');
    expect(r.error).toBeUndefined();
    expect(String(r.state?._lastEvent ?? '')).toContain('Переход'); // 8+1..3 очков ≥ 9 → повышение
    const state = (await loadState('9403')) as any;
    expect(state.league.slot).toBe(0);
    expect(state.league.season).toBe(2);
    // 8 очков + победа 3 = 11 ≥ 9 → повышение; поражение +1 = 9 → тоже
    expect(['silver', 'bronze']).toContain(state.league.division);
  });
});

describe('турниры', () => {
  it('IT-турнир: взнос, приз, флаг дня', async () => {
    await reset(9404);
    await patch(9404, { money: 10000, energy: 10 });
    const r = await act(9404, 'it_tourney');
    expect(r.error).toBeUndefined();
    const state = (await loadState('9404')) as any;
    expect(state.itTourneyDoneToday).toBe(true);
    expect(state.fame).toBeGreaterThanOrEqual(1);
    expect(state.slotsUsed).toBe(2);
    const again = await act(9404, 'it_tourney');
    expect(again.error).toContain('уже был');
  });

  it('корпоративный турнир закрыт до senior', async () => {
    await reset(9405);
    await patch(9405, { money: 10000, energy: 10, grade: 'intern' });
    const r = await act(9405, 'corp_tourney');
    expect(r.error).toContain('senior');
    await patch(9405, { grade: 'senior' });
    const ok = await act(9405, 'corp_tourney');
    expect(ok.error).toBeUndefined();
    const state = (await loadState('9405')) as any;
    expect(state.corpTourneyDoneToday).toBe(true);
    expect(state.fame).toBeGreaterThanOrEqual(1);
  });
});
