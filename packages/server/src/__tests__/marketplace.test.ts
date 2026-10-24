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

describe('P2P: sell/buy/payout/cancel (эскроу-лайт)', () => {
  it('sell: питомец уходит в эскроу-лок, объявление активно', async () => {
    await reset(710);
    await patch(710, { money: 500_000, items: ['pet_fox', 'pet_owl'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(710) },
      payload: { itemId: 'pet_fox', price: 95000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toContain('выставлен на продажу');
    // эскроу-лок: питомец вычтен из сейва
    expect(res.json().state.items).toEqual(['pet_owl']);

    const board = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(711) },
    });
    expect(board.statusCode).toBe(200);
    const found = (board.json().offers as any[]).find((o) => o.itemId === 'pet_fox' && !o.own);
    expect(found).toBeTruthy();
    expect(found.price).toBe(95000);
  });

  it('sell: отказы — нет питомца, Stars-эксклюзив, цена вне коридора, лимит объявлений', async () => {
    await reset(712);
    await patch(712, { money: 500_000, items: ['pet_owl', 'pet_halo', 'pet_turtle', 'pet_parrot'] });

    const noPet = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(712) },
      payload: { itemId: 'pet_dragon', price: 800000 },
    });
    expect(noPet.statusCode).toBe(400);

    const stars = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(712) },
      payload: { itemId: 'pet_halo', price: 150 },
    });
    expect(stars.statusCode).toBe(400);
    expect(stars.json().error).toContain('Stars');

    const corridor = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(712) },
      payload: { itemId: 'pet_owl', price: 1000 },
    });
    expect(corridor.statusCode).toBe(400);
    expect(corridor.json().error).toContain('коридора');

    // лимит: 2 активных объявления, третье — отказ
    for (const [itemId, price] of [
      ['pet_owl', 120000],
      ['pet_turtle', 80000],
    ] as const) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/game/marketplace/sell',
        headers: { authorization: tma(712) },
        payload: { itemId, price },
      });
      expect(ok.statusCode).toBe(200);
    }
    const third = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(712) },
      payload: { itemId: 'pet_parrot', price: 22000 },
    });
    expect(third.statusCode).toBe(400);
    expect(third.json().error).toContain('максимум');
  });

  it('buy: деньги в эскроу, самопокупка запрещена; payout — деньги продавцу', async () => {
    await reset(713);
    await reset(714);
    await patch(713, { money: 200_000, items: ['pet_fox'] });
    await patch(714, { money: 200_000, items: [] });

    const sell = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(713) },
      payload: { itemId: 'pet_fox', price: 95000 },
    });
    expect(sell.statusCode).toBe(200);

    const board = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(714) },
    });
    const offer = (board.json().offers as any[]).find((o) => o.itemId === 'pet_fox');
    expect(offer).toBeTruthy();

    const self = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/buy`,
      headers: { authorization: tma(713) },
    });
    expect(self.statusCode).toBe(400);
    expect(self.json().error).toContain('себя');

    const buy = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/buy`,
      headers: { authorization: tma(714) },
    });
    expect(buy.statusCode).toBe(200);
    expect(buy.json().state.money).toBe(200_000 - 95000);
    expect(buy.json().state.items).toContain('pet_fox');

    // продавцу деньги ещё не пришли — они в эскроу
    const mid = (await loadState('713')) as any;
    expect(mid.money).toBe(200_000);

    const payout = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/payout`,
      headers: { authorization: tma(713) },
    });
    expect(payout.statusCode).toBe(200);
    expect(payout.json().state.money).toBe(200_000 + 95000);
    expect(payout.json().state._lastEvent).toContain('95');

    // повторный payout — отказ
    const again = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/payout`,
      headers: { authorization: tma(713) },
    });
    expect(again.statusCode).toBe(400);
  });

  it('cancel: питомец возвращается продавцу; истёкшие объявления закрываются лениво', async () => {
    await reset(715);
    await patch(715, { money: 100_000, items: ['pet_turtle'] });

    const sell = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(715) },
      payload: { itemId: 'pet_turtle', price: 80000 },
    });
    const offerId = /Объявление|выставлен/.test(sell.json().state._lastEvent) ? true : false;
    expect(offerId).toBe(true);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(715) },
    });
    const active = (mine.json().mine as any[]).find((o) => o.status === 'active');
    expect(active).toBeTruthy();

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${active.id}/cancel`,
      headers: { authorization: tma(715) },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().state.items).toContain('pet_turtle');

    // истечение: объявление с прошедшим expiresAt возвращает питомца
    await patch(715, { items: [] });
    const store = await import('../services/gameStore.js');
    const backend = store.__offerBackend();
    await backend.put({
      id: 'exp-1',
      sellerId: '715',
      itemId: 'pet_owl',
      price: 120000,
      createdAt: Date.now() - 100_000,
      expiresAt: Date.now() - 1000,
      status: 'active',
    });
    const swept = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(715) },
    });
    expect(swept.statusCode).toBe(200);
    const expired = (swept.json().mine as any[]).find((o) => o.id === 'exp-1');
    expect(expired.status).toBe('expired');
    expect(((await loadState('715')) as any).items).toContain('pet_owl');
  });
});

describe('P2P: репутация продавца и история сделок', () => {
  it('GET /offers несёт rep, history и myRep; сделка видна с обеих сторон', async () => {
    await reset(720);
    await reset(721);
    await patch(720, { money: 300_000, items: ['pet_dragon'] });
    await patch(721, { money: 900_000, items: [] });

    const sell = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(720) },
      payload: { itemId: 'pet_dragon', price: 800000 },
    });
    expect(sell.statusCode).toBe(200);

    // репутация новичка — 0 сделок, но объявление уже на витрине
    const board0 = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(721) },
    });
    const offer = (board0.json().offers as any[]).find((o) => o.itemId === 'pet_dragon');
    expect(offer.rep).toBe(0);

    const buy = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/buy`,
      headers: { authorization: tma(721) },
    });
    expect(buy.statusCode).toBe(200);

    // продавец: history «продано», деньги ещё в эскроу, myRep=1
    const sellerView = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(720) },
    });
    expect(sellerView.json().myRep).toBe(1);
    const sold = (sellerView.json().history as any[]).find((h) => h.itemId === 'pet_dragon');
    expect(sold.role).toBe('sold');
    expect(sold.price).toBe(800000);
    expect(sold.settled).toBe(false);

    // покупатель: history «куплено»
    const buyerView = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(721) },
    });
    const bought = (buyerView.json().history as any[]).find((h) => h.itemId === 'pet_dragon');
    expect(bought.role).toBe('bought');
    expect(bought.settled).toBe(false);

    // payout: сделка закрыта, settled=true
    const payout = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/payout`,
      headers: { authorization: tma(720) },
    });
    expect(payout.statusCode).toBe(200);
    const afterPayout = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(720) },
    });
    const settled = (afterPayout.json().history as any[]).find((h) => h.itemId === 'pet_dragon');
    expect(settled.settled).toBe(true);
    expect(afterPayout.json().myRep).toBe(1);

    // новый покупатель видит репутацию продавца на витрине (создадим ещё объявление)
    await patch(720, { items: ['pet_owl'] });
    const sell2 = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(720) },
      payload: { itemId: 'pet_owl', price: 120000 },
    });
    expect(sell2.statusCode).toBe(200);
    const board2 = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(721) },
    });
    const owl = (board2.json().offers as any[]).find((o) => o.itemId === 'pet_owl');
    expect(owl.rep).toBe(1);
  });

  it('снятые и истёкшие объявления не попадают в историю сделок', async () => {
    await reset(722);
    await patch(722, { money: 100_000, items: ['pet_turtle'] });
    const sell = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(722) },
      payload: { itemId: 'pet_turtle', price: 80000 },
    });
    expect(sell.statusCode).toBe(200);
    const mine = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(722) },
    });
    const active = (mine.json().mine as any[]).find((o) => o.status === 'active');
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${active.id}/cancel`,
      headers: { authorization: tma(722) },
    });
    expect(cancel.statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(722) },
    });
    expect(after.json().history).toEqual([]);
    expect(after.json().myRep).toBe(0);
  });
});
