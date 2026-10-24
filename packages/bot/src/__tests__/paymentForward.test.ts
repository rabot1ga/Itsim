import { describe, it, expect, vi } from 'vitest';
import { isPaymentUpdate, forwardPaymentUpdate } from '../paymentForward';

/**
 * Форвард платёжных апдейтов на игровой сервер — без него живые Stars-платежи
 * через бота не работают (pre_checkout_query без ответа → отмена платежа,
 * successful_payment без гранта → пропавшая покупка).
 */

const preCheckout = { update_id: 1, pre_checkout_query: { id: 'q1', from: { id: 42 }, invoice_payload: 'x' } };
const paid = {
  update_id: 2,
  message: { chat: { id: 42 }, successful_payment: { invoice_payload: 'x', telegram_payment_charge_id: 'ch1' } },
};
const plain = { update_id: 3, message: { chat: { id: 42 }, text: '/stats' } };

function fakeFetch(ok: boolean, seen: { url?: string; body?: string; headers?: Record<string, string> } = {}) {
  return vi.fn(async (url: any, init: any) => {
    seen.url = String(url);
    seen.body = init?.body;
    seen.headers = init?.headers;
    return { ok, status: ok ? 200 : 502 } as Response;
  }) as unknown as typeof fetch;
}

describe('isPaymentUpdate', () => {
  it('отличает платёжные апдейты от обычных', () => {
    expect(isPaymentUpdate(preCheckout)).toBe(true);
    expect(isPaymentUpdate(paid)).toBe(true);
    expect(isPaymentUpdate(plain)).toBe(false);
    expect(isPaymentUpdate(null)).toBe(false);
  });
});

describe('forwardPaymentUpdate', () => {
  it('шлёт сырой update на /api/payments/webhook с секретом', async () => {
    const seen: { url?: string; body?: string; headers?: Record<string, string> } = {};
    const ok = await forwardPaymentUpdate(preCheckout, {
      apiUrl: 'http://game:3001',
      secret: 's3cret',
      fetchImpl: fakeFetch(true, seen),
    });
    expect(ok).toBe(true);
    expect(seen.url).toBe('http://game:3001/api/payments/webhook');
    expect(seen.headers?.['x-telegram-bot-api-secret-token']).toBe('s3cret');
    expect(JSON.parse(seen.body!)).toEqual(preCheckout);
  });

  it('не-платёжные апдейты и пустая конфигурация — без запроса', async () => {
    const fetchImpl = fakeFetch(true);
    expect(await forwardPaymentUpdate(plain, { apiUrl: 'http://game:3001', secret: 's', fetchImpl })).toBe(false);
    expect(await forwardPaymentUpdate(paid, { apiUrl: '', secret: 's', fetchImpl })).toBe(false);
    expect(await forwardPaymentUpdate(paid, { apiUrl: 'http://game:3001', secret: '', fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('отказ сервера/сеть — false (бот успеет ответить фолбэком)', async () => {
    expect(
      await forwardPaymentUpdate(paid, { apiUrl: 'http://game:3001', secret: 's', fetchImpl: fakeFetch(false) })
    ).toBe(false);
    const throwing = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await forwardPaymentUpdate(paid, { apiUrl: 'http://game:3001', secret: 's', fetchImpl: throwing })).toBe(
      false
    );
  });
});
