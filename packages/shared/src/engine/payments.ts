/**
 * Payload инвойса Telegram Stars — единый формат для игрового сервера
 * (webhook грантит покупку) и бота (sendInvoice из чата). Формат:
 * `itsim:v1:<userId>:<productId>:<nonce>`; nonce — короткая случайная
 * уникальность счёта (её подаёт вызывающий, чтобы helper оставался чистым
 * и работал и в браузере, и в Node).
 */
export const PAYMENT_PAYLOAD_PREFIX = 'itsim:v1';

export function buildPaymentPayload(userId: string, productId: string, nonce: string): string {
  return `${PAYMENT_PAYLOAD_PREFIX}:${userId}:${productId}:${nonce}`;
}

export function parsePaymentPayload(payload: string): { userId: string; productId: string } | null {
  const parts = String(payload ?? '').split(':');
  if (parts.length < 4 || `${parts[0]}:${parts[1]}` !== PAYMENT_PAYLOAD_PREFIX) return null;
  return { userId: parts[2], productId: parts[3] };
}
