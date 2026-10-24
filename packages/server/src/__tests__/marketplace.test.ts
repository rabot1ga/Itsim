import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Торговая площадка редких питомцев: витрина дня стабильна в течение дня,
 * покупка списывает ₽ и кладёт питомца в инвентарь; мусорные покупки — 400.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-market-'));
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

describe('GET /api/game/marketplace', () => {
  it('витрина дня стабильна, есть имя/описание/цена/редкость', async () => {
    await reset(701);
    const a = await app.inject({ method: 'GET', url: '/api/game/marketplace', headers: { authorization: tma(701) } });
    const b = await app.inject({ method: 'GET', url: '/api/game/marketplace', headers: { authorization: tma(701) } });
    expect(a.statusCode).toBe(200);
    expect(a.json().listings.length).toBeGreaterThan(0);
    expect(a.json().listings).toEqual(b.json().listings);
    const l = a.json().listings[0];
    expect(l.name).toBeTruthy();
    expect(l.description).toBeTruthy();
    expect(l.price).toBeGreaterThan(0);
    expect(['rare', 'legendary']).toContain(l.rarity);
  });
});

describe('POST /api/game/marketplace/buy', () => {
  it('покупка списывает деньги и кладёт питомца в инвентарь', async () => {
    await reset(702);
    await patch(702, { money: 10_000_000 });
    const res = await app.inject({ method: 'GET', url: '/api/game/marketplace', headers: { authorization: tma(702) } });
    const listing = res.json().listings[0];

    const buy = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/buy',
      headers: { authorization: tma(702) },
      payload: { itemId: listing.itemId },
    });
    expect(buy.statusCode).toBe(200);
    const state = buy.json().state;
    expect(state.items).toContain(listing.itemId);
    expect(state.money).toBe(10_000_000 - listing.price);
    expect(state._lastEvent).toContain('теперь живёт у тебя дома');

    // повторная покупка — 400 (уже в коллекции)
    const again = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/buy',
      headers: { authorization: tma(702) },
      payload: { itemId: listing.itemId },
    });
    expect(again.statusCode).toBe(400);
  });

  it('не в витрине / нет денег / нет игры — отказ', async () => {
    await reset(703);
    await patch(703, { money: 1 });
    // призрачный предмет
    const ghost = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/buy',
      headers: { authorization: tma(703) },
      payload: { itemId: 'pet_not_exists' },
    });
    expect(ghost.statusCode).toBe(400);
    // витрина есть, но денег нет
    const res = await app.inject({ method: 'GET', url: '/api/game/marketplace', headers: { authorization: tma(703) } });
    const listing = res.json().listings[0];
    const poor = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/buy',
      headers: { authorization: tma(703) },
      payload: { itemId: listing.itemId },
    });
    expect(poor.statusCode).toBe(400);
    // без игры
    const noGame = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/buy',
      headers: { authorization: tma(999) },
      payload: { itemId: listing.itemId },
    });
    expect(noGame.statusCode).toBe(404);
  });
});

describe('Stars-эксклюзивы (мерч v2): не покупаются за ₽', () => {
  it('buy_item на грантовый предмет (price 0) отклоняется', async () => {
    await reset(705);
    await patch(705, { money: 5_000_000, energy: 10 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/action',
      headers: { authorization: tma(705) },
      payload: { actionId: 'buy_item', params: { itemId: 'pet_halo' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Stars');
    const state = (await loadState('705')) as { items: string[] };
    expect(state.items).not.toContain('pet_halo');
  });

  it('витрина каталога не показывает грантовые эксклюзивы', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content/items' });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().items as Array<{ id: string; price: number }>).map((i) => i.id);
    expect(ids).not.toContain('pet_halo');
    expect(ids).not.toContain('pet_wings');
    expect(ids).not.toContain('pet_visor');
    expect(ids).not.toContain('pet_scarf');
    // обычные аксессуары за ₽ по-прежнему в витрине
    expect(ids).toContain('pet_bow');
  });
});
