import { describe, it, expect } from 'vitest';
import { buildPaymentPayload, parsePaymentPayload, PAYMENT_PAYLOAD_PREFIX } from '../payments';

/**
 * Payload инвойса Stars — контракт между ботом (sendInvoice) и сервером
 * (webhook parsePayload). Формат заморожен: его разбирают обе стороны.
 */
describe('payment payload', () => {
  it('roundtrip: build → parse', () => {
    const payload = buildPaymentPayload('4242', 'bank_slot', 'ab12cd34');
    expect(payload).toBe('itsim:v1:4242:bank_slot:ab12cd34');
    expect(parsePaymentPayload(payload)).toEqual({ userId: '4242', productId: 'bank_slot' });
  });

  it('мусор и чужие форматы — null', () => {
    for (const bad of ['', 'x', 'itsim:v2:1:2:3', 'other:v1:1:2:3', 'itsim:v1:only-two', null, undefined]) {
      expect(parsePaymentPayload(bad as string)).toBeNull();
    }
  });

  it('префикс стабилен (его ждёт серверный webhook)', () => {
    expect(PAYMENT_PAYLOAD_PREFIX).toBe('itsim:v1');
  });
});
