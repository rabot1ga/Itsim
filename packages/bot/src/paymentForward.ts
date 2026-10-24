/**
 * Форвард платёжных апдейтов Telegram на игровой сервер.
 *
 * Почему это важно: в polling-режиме бот сам забирает апдейты (`deleteWebhook`),
 * и `pre_checkout_query` не доходит до `/api/payments/webhook` — без ответа на
 * pre-checkout Telegram отменяет платёж через ~10 секунд, а `successful_payment`
 * никто не грантит. Бот шлёт сырой update на сервер с тем же секретом, которым
 * Telegram подписал бы свой вебхук; сервер отвечает на pre-checkout и грантит
 * покупку (включая сообщение игроку) — боту остаётся только доставить.
 */
export interface PaymentForwardTarget {
  /** Базовый URL игрового сервера, например http://127.0.0.1:3001 */
  apiUrl: string;
  /** Общий секрет TELEGRAM_WEBHOOK_SECRET (его ждёт серверный webhook). */
  secret: string;
  fetchImpl?: typeof fetch;
}

export function isPaymentUpdate(update: unknown): boolean {
  const u = update as { pre_checkout_query?: unknown; message?: { successful_payment?: unknown } } | null;
  return Boolean(u && (u.pre_checkout_query || u.message?.successful_payment));
}

/** true — сервер принял (грант/ответ на pre-checkout сделаны). */
export async function forwardPaymentUpdate(update: unknown, target: PaymentForwardTarget): Promise<boolean> {
  if (!isPaymentUpdate(update)) return false;
  if (!target.apiUrl || !target.secret) return false;
  const doFetch = target.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${target.apiUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': target.secret,
      },
      body: JSON.stringify(update),
    });
    return res.ok;
  } catch (err) {
    console.error('payment forward failed:', (err as Error).message);
    return false;
  }
}
