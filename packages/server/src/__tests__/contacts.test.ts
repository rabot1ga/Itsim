import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * D2 «Связи как ресурс» (25.10.2026):
 *   - «Провести время с другом» даёт +1 связи;
 *   - три траты: рекомендация (10), лид фриланса (6), скидка P2P (5);
 *   - лид усиливает отклик на заказ и сгорает; скидка режет цену покупки
 *     у игрока (продавцу уходит полная цена); рекомендация гарантирует оффер.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-contacts-'));
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
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/action',
    headers: { authorization: tma(id) },
    payload: { actionId, params },
  });
  return { status: res.statusCode, body: res.json() };
}

describe('D2: связи растут', () => {
  it('«Провести время с другом» даёт +1 связи сверх отношений', async () => {
    await reset(721);
    await patch(721, { energy: 10, contacts: 0 });
    const before = ((await loadState('721')) as any).relationships.uni_friend ?? 0;
    const { status, body } = await act(721, 'spend_time_with_friend', { npcId: 'uni_friend' });
    expect(status).toBe(200);
    const state = (await loadState('721')) as any;
    expect(state.contacts).toBe(1);
    expect(state.relationships.uni_friend).toBe(before + 8); // +8 — как в D1
    expect(body.state.contacts).toBe(1);
  });
});

describe('D2: траты связей', () => {
  it('рекомендация: списывает 10, ставит бафф, повтор и нехватка — 400', async () => {
    await reset(722);
    await patch(722, { contacts: 10 });
    const ok = await act(722, 'use_recommendation');
    expect(ok.status).toBe(200);
    let state = (await loadState('722')) as any;
    expect(state.contacts).toBe(0);
    expect(state.recommendation).toBe(true);

    const again = await act(722, 'use_recommendation');
    expect(again.status).toBe(400);
    expect(again.body.error).toContain('уже на руках');

    await patch(722, { recommendation: false, contacts: 3 });
    const poor = await act(722, 'use_recommendation');
    expect(poor.status).toBe(400);
    expect(poor.body.error).toContain('Столько знакомств нет');
    expect(((await loadState('722')) as any).contacts).toBe(3); // не списано
  });

  it('лид фриланса и скидка P2P: независимые баффы со своими ценами', async () => {
    await reset(723);
    await patch(723, { contacts: 20 });

    const lead = await act(723, 'use_freelance_lead');
    expect(lead.status).toBe(200);
    let state = (await loadState('723')) as any;
    expect(state.freelanceLead).toBe(true);
    expect(state.contacts).toBe(14); // 20 − 6

    const disc = await act(723, 'use_p2p_discount');
    expect(disc.status).toBe(200);
    state = (await loadState('723')) as any;
    expect(state.p2pDiscount).toBe(true);
    expect(state.contacts).toBe(9); // 14 − 5
  });
});

describe('D2: баффы работают по назначению', () => {
  it('тёплый лид усиливает отклик на заказ и сгорает', async () => {
    await reset(724);
    await patch(724, {
      contacts: 6,
      energy: 10,
      skills: { javascript: { level: 10, xp: 0 } },
      mainSkillId: 'javascript',
    });
    await act(724, 'use_freelance_lead');
    const plain = await act(724, 'freelance', { projectId: 'landing' });
    expect(plain.status).toBe(200);
    const state = (await loadState('724')) as any;
    expect(state.freelanceBid).toBeTruthy();
    expect(state.freelanceLead).toBe(false); // сгорел

    // контроль: без лида тот же заказ с теми же скиллами даёт базовый шанс
    await reset(725);
    await patch(725, {
      energy: 10,
      skills: { javascript: { level: 10, xp: 0 } },
      mainSkillId: 'javascript',
    });
    const control = await act(725, 'freelance', { projectId: 'landing' });
    expect(control.status).toBe(200);
    const cstate = (await loadState('725')) as any;
    expect(state.freelanceBid.chance - cstate.freelanceBid.chance).toBeCloseTo(0.3, 2); // ровно бонус лида
    expect(state.freelanceBid.chance).toBeLessThanOrEqual(0.95); // кап 95%
  });

  it('скидка P2P: покупка у игрока на 25% дешевле, продавцу полная цена', async () => {
    await reset(726); // продавец
    await reset(727); // покупатель
    await patch(726, { money: 200_000, items: ['pet_fox'] });
    await patch(727, { money: 200_000, items: [], contacts: 5 });

    const sell = await app.inject({
      method: 'POST',
      url: '/api/game/marketplace/sell',
      headers: { authorization: tma(726) },
      payload: { itemId: 'pet_fox', price: 96000 },
    });
    expect(sell.statusCode).toBe(200);

    const board = await app.inject({
      method: 'GET',
      url: '/api/game/marketplace/offers',
      headers: { authorization: tma(727) },
    });
    const offer = (board.json().offers as any[]).find((o) => o.itemId === 'pet_fox');
    expect(offer).toBeTruthy();

    await act(727, 'use_p2p_discount');
    const buy = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/buy`,
      headers: { authorization: tma(727) },
    });
    expect(buy.statusCode).toBe(200);

    const buyer = (await loadState('727')) as any;
    expect(buyer.p2pDiscount).toBe(false); // сгорел
    // 96000 * 0.75 = 72000 — ровно, округление вверх до 10 ничего не меняет
    expect(buyer.money).toBe(200_000 - 72_000);

    // продавцу уходит полная цена из эскроу
    const payout = await app.inject({
      method: 'POST',
      url: `/api/game/marketplace/offers/${offer.id}/payout`,
      headers: { authorization: tma(726) },
    });
    expect(payout.statusCode).toBe(200);
    const seller = (await loadState('726')) as any;
    expect(seller.money).toBe(200_000 + 96_000);
  });

  it('рекомендация гарантирует оффер и сгорает', async () => {
    await reset(728);
    await patch(728, {
      contacts: 10,
      currentDay: 3,
      // заведомо тяжёлые требования — без рекомендации это лотерея
      currentApplication: {
        companyId: 'search_everything',
        position: 'Мидл-разработчик',
        grade: 'middle',
        status: 'interview_scheduled',
        matchScore: 10,
        interviewDay: 3,
        requirements: { javascript: 100 },
      },
      interviewSession: {
        companyId: 'search_everything',
        questions: [
          { id: 'js_typeof_null', chosen: 0, correct: true },
          { id: 'js_equality', chosen: 1, correct: true },
          { id: 'js_const', chosen: 0, correct: true },
        ],
      },
    });
    await act(728, 'use_recommendation');

    const finish = await app.inject({
      method: 'POST',
      url: '/api/game/interview/finish',
      headers: { authorization: tma(728) },
    });
    expect(finish.statusCode).toBe(200);
    expect(finish.json().result).toBe('offer');
    expect(finish.json().recommended).toBe(true);

    const state = (await loadState('728')) as any;
    expect(state.recommendation).toBe(false); // сгорела
    expect(state.pendingOffers).toHaveLength(1);
  });
});
