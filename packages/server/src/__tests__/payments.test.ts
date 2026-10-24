import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';

/**
 * Telegram Stars payments.
 *
 * What the MVP had: a mock invoice link and a webhook that answered `{ok:true}`
 * to anyone (ANALYSIS §6). What is tested here: the webhook authenticates the
 * caller, pre-checkout is answered, granting is idempotent per charge id, and
 * the catalogue enforces one-off/daily limits.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-payments-'));
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

const WEBHOOK_SECRET = 'test-webhook-secret';

const PRODUCTS = [
  {
    id: 'banked_day',
    title: 'День в банке',
    description: '+1 день',
    stars: 50,
    repeatable: true,
    dailyLimit: 2,
    grants: { bankedDays: 1 },
  },
  {
    id: 'bank_slot',
    title: 'Слот банка дней',
    description: '+1 к ёмкости банка',
    stars: 120,
    repeatable: true,
    totalLimit: 3,
    grants: { bankSlots: 1 },
  },
  {
    id: 'wardrobe_premium',
    title: 'Ангельский прикид',
    description: 'Косметика',
    stars: 150,
    repeatable: false,
    grants: { cosmetics: ['pet_halo'], badge: 'fashionista' },
  },
  {
    id: 'winter_pack',
    title: 'Зимний набор',
    description: 'Сезонная косметика',
    stars: 200,
    repeatable: false,
    tag: 'seasonal',
    grants: { cosmetics: ['pet_santa', 'pet_mitten', 'pet_snowflake'], badge: 'winter' },
  },
];

async function buildApp() {
  vi.resetModules();
  process.env.DATA_DIR = DATA_DIR;
  process.env.BOT_TOKEN = '';
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.ALLOW_MOCK_PAYMENTS = 'true';

  const { paymentRoutes } = await import('../routes/payments');
  const contentService = await import('../services/contentService');
  const store = await import('../services/gameStore');
  const entitlements = await import('../services/entitlements');

  store.clearCache();
  await entitlements.resetEntitlements();

  contentService.setContent({
    monetization: { currency: 'XTR', policy: 'no pay-to-win', products: PRODUCTS },
  } as any);

  const app = Fastify();
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.ready();

  // A save must exist for grants to land somewhere.
  await store.saveState('1', {
    version: 2,
    telegramId: '1',
    firstName: 'Dev',
    currentDay: 3,
    bankedDays: 0,
    items: [],
    entitlements: [],
    badges: [],
  });

  return { app, store, entitlements };
}

function successfulPayment(chargeId: string, payload: string, userId = 1) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: userId, first_name: 'Dev' },
      chat: { id: userId, type: 'private' },
      successful_payment: {
        currency: 'XTR',
        total_amount: 50,
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
      },
    },
  };
}

describe('payments: catalogue and invoices', () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it('serves the catalogue with ownership flags', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/payments/products' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currency).toBe('XTR');
    expect(body.products).toHaveLength(4);
    expect(body.products[0].owned).toBe(false);
    expect(body.mock).toBe(true);
  });

  it('rejects an unknown product', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/payments/stars', payload: { productId: 'gold_money' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns a mock invoice without BOT_TOKEN instead of pretending to be real', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/payments/stars', payload: { productId: 'banked_day' } });
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.payload).toMatch(/^itsim:v1:1:banked_day:/);
  });

  it('refuses to sell a one-off product twice', async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/api/payments/dev-complete', payload: { productId: 'wardrobe_premium' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/stars',
      payload: { productId: 'wardrobe_premium' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/куплено/i);
  });

  it('enforces the daily limit of a repeatable product', async () => {
    const { app } = await buildApp();
    for (let i = 0; i < 2; i++) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/payments/dev-complete',
        payload: { productId: 'banked_day' },
      });
      expect(ok.statusCode).toBe(200);
    }
    const third = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'banked_day' },
    });
    expect(third.statusCode).toBe(409);
  });
});

describe('payments: webhook authentication', () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it('rejects a webhook call without the secret token', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      payload: successfulPayment('charge_1', 'itsim:v1:1:banked_day:abcd'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a webhook call with a wrong secret token', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': 'not-the-secret' },
      payload: successfulPayment('charge_1', 'itsim:v1:1:banked_day:abcd'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a correctly signed call', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: successfulPayment('charge_1', 'itsim:v1:1:banked_day:abcd'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted).toBe(true);
  });
});

describe('payments: granting', () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it('applies the grant to the player save', async () => {
    const { app, store } = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: successfulPayment('charge_a', 'itsim:v1:1:wardrobe_premium:abcd'),
    });

    const state = await store.loadState('1');
    expect(state.entitlements).toContain('pet_halo');
    // Косметика видима: грант кладёт её и в items (питомец читает items).
    expect(state.items).toContain('pet_halo');
    expect(state.badges).toContain('fashionista');
  });

  it('сезонный набор выдаёт весь комплект косметики и значок разом', async () => {
    const { app, store } = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: successfulPayment('charge_bundle', 'itsim:v1:1:winter_pack:abcd'),
    });

    const state = await store.loadState('1');
    for (const id of ['pet_santa', 'pet_mitten', 'pet_snowflake']) {
      expect(state.entitlements).toContain(id);
      expect(state.items).toContain(id);
    }
    expect(state.badges).toContain('winter');
  });

  it('is idempotent: a retried webhook does not grant twice', async () => {
    const { app, store } = await buildApp();
    const call = () =>
      app.inject({
        method: 'POST',
        url: '/api/payments/webhook',
        headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        payload: successfulPayment('charge_same', 'itsim:v1:1:banked_day:abcd'),
      });

    const first = await call();
    const second = await call();

    expect(first.json().granted).toBe(true);
    expect(second.json().granted).toBe(false);
    expect(second.json().duplicate).toBe(true);
    expect((await store.loadState('1')).bankedDays).toBe(1);
  });

  it('ignores a payment whose payload does not parse', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: successfulPayment('charge_x', 'garbage'),
    });
    expect(res.json().granted).toBe(false);
  });

  it('answers pre-checkout queries (Telegram cancels the charge otherwise)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: {
        update_id: 2,
        pre_checkout_query: { id: 'q1', from: { id: 1 }, invoice_payload: 'itsim:v1:1:banked_day:abcd' },
      },
    });
    expect(res.json().approved).toBe(true);
  });

  it('declines a pre-checkout query issued for another player', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: {
        update_id: 3,
        pre_checkout_query: { id: 'q2', from: { id: 999 }, invoice_payload: 'itsim:v1:1:banked_day:abcd' },
      },
    });
    expect(res.json().approved).toBe(false);
  });
});

describe('payments: payload helpers', () => {
  it('round-trips a payload', async () => {
    const { buildPayload, parsePayload } = await import('../routes/payments');
    const payload = buildPayload('4242', 'banked_day');
    expect(parsePayload(payload)).toEqual({ userId: '4242', productId: 'banked_day' });
  });

  it('rejects foreign payloads', async () => {
    const { parsePayload } = await import('../routes/payments');
    expect(parsePayload('nope')).toBeNull();
    expect(parsePayload('other:v1:1:x:y')).toBeNull();
  });
});

describe('payments: слоты банка дней и ёмкость банка', () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it('bank_slot: +1 слот за покупку, всего 3, четвёртая — лимит', async () => {
    const { app, store } = await buildApp();
    for (let i = 1; i <= 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/payments/dev-complete',
        payload: { productId: 'bank_slot' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().applied).toContain('+1 слот банка дней');
      expect(((await store.loadState('1')) as any).bankSlots).toBe(i);
    }
    const fourth = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'bank_slot' },
    });
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error).toContain('Лимит');
  });

  it('banked_day при полном банке — отказ; слот раздвигает ёмкость', async () => {
    const { app, store } = await buildApp();
    const state = (await store.loadState('1')) as any;
    state.bankedDays = 7; // базовый кап 7, слотов нет
    await store.saveState('1', state);

    const full = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'banked_day' },
    });
    expect(full.statusCode).toBe(409);
    expect(full.json().error).toContain('полон');

    // слот → ёмкость 8, и тот же banked_day проходит
    const slot = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'bank_slot' },
    });
    expect(slot.statusCode).toBe(200);
    const day = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'banked_day' },
    });
    expect(day.statusCode).toBe(200);
    const after = (await store.loadState('1')) as any;
    expect(after.bankSlots).toBe(1);
    expect(after.bankedDays).toBe(8);
  });

  it('bank_slot при 3 слотах в сейве — отказ «слоты куплены»', async () => {
    const { app, store } = await buildApp();
    const state = (await store.loadState('1')) as any;
    state.bankSlots = 3;
    await store.saveState('1', state);
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/dev-complete',
      payload: { productId: 'bank_slot' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('слоты');
  });

  it('грант banked_days не превышает ёмкость с учётом слотов', async () => {
    const { store, entitlements } = await buildApp();
    await entitlements.applyGrantsToState('1', { bankSlots: 1 });
    await entitlements.applyGrantsToState('1', { bankedDays: 5 });
    await entitlements.applyGrantsToState('1', { bankedDays: 5 });
    // кап 8 (7 + слот): повторный грант дотягивает ровно до 8 и не выше
    const state = (await store.loadState('1')) as any;
    expect(state.bankSlots).toBe(1);
    expect(state.bankedDays).toBe(8);
  });
});
