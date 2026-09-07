import { config } from '../config.js';

/**
 * Minimal Telegram Bot API client (server side).
 *
 * Only the calls the game server itself needs: Stars invoices, pre-checkout
 * answers and payment-related notifications. The bot process has its own
 * client (`packages/bot/src/telegramApi.ts`) with the polling machinery.
 *
 * Without BOT_TOKEN every call is a no-op returning `{ ok: false, mock: true }`,
 * which keeps local development and CI free of network access.
 */

const API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';

export interface TelegramResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  mock?: boolean;
}

export function isBotConfigured(): boolean {
  return Boolean(config.botToken);
}

export async function callTelegram<T = any>(method: string, payload: Record<string, any> = {}): Promise<TelegramResult<T>> {
  if (!config.botToken) {
    return { ok: false, mock: true, description: 'BOT_TOKEN not configured (mock mode)' };
  }

  try {
    const res = await fetch(`${API_ROOT}/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as TelegramResult<T>;
    if (!data.ok) console.error(`Telegram ${method} failed: ${data.description}`);
    return data;
  } catch (err) {
    console.error(`Telegram ${method} threw:`, err);
    return { ok: false, description: (err as Error).message };
  }
}

export interface InvoiceRequest {
  title: string;
  description: string;
  /** opaque payload echoed back in successful_payment */
  payload: string;
  /** price in Telegram Stars (currency XTR) */
  stars: number;
  photoUrl?: string;
}

/**
 * https://core.telegram.org/bots/api#createinvoicelink (Stars: currency XTR,
 * empty provider_token, single price component).
 */
export async function createStarsInvoiceLink(req: InvoiceRequest): Promise<TelegramResult<string>> {
  return callTelegram<string>('createInvoiceLink', {
    title: req.title,
    description: req.description,
    payload: req.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: req.title, amount: req.stars }],
    ...(req.photoUrl ? { photo_url: req.photoUrl } : {}),
  });
}

export async function answerPreCheckoutQuery(id: string, ok: boolean, errorMessage?: string): Promise<TelegramResult> {
  return callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? 'Покупка недоступна' }),
  });
}

export async function sendMessage(chatId: number | string, text: string, extra: Record<string, any> = {}): Promise<TelegramResult> {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

/** Stars refunds — required by Telegram's Stars policy for support requests. */
export async function refundStarPayment(userId: number | string, chargeId: string): Promise<TelegramResult> {
  return callTelegram('refundStarPayment', { user_id: Number(userId), telegram_payment_charge_id: chargeId });
}
