/**
 * Minimal Telegram Bot API client for the bot process.
 *
 * Everything the bot needs and nothing else: long polling, sendMessage,
 * setMyCommands, webhook management. Uses global `fetch` (Node 18+), no deps.
 *
 * Without a token every call short-circuits to `{ ok: false, mock: true }`, so
 * the bot can be started (and tested) offline.
 */

export interface TelegramResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  mock?: boolean;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date?: number;
  text?: string;
  successful_payment?: {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    telegram_payment_charge_id: string;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage };
  pre_checkout_query?: { id: string; from: TelegramUser; invoice_payload: string };
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: Record<string, any>;
  disable_notification?: boolean;
  link_preview_options?: { is_disabled?: boolean };
}

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly apiRoot = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org'
  ) {}

  get configured(): boolean {
    return Boolean(this.token);
  }

  async call<T = any>(method: string, payload: Record<string, any> = {}, timeoutMs = 65_000): Promise<TelegramResponse<T>> {
    if (!this.token) return { ok: false, mock: true, description: 'BOT_TOKEN not set (mock mode)' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.apiRoot}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = (await res.json()) as TelegramResponse<T>;
      if (!data.ok) console.error(`[tg] ${method} failed (${data.error_code}): ${data.description}`);
      return data;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { ok: false, description: 'timeout' };
      console.error(`[tg] ${method} threw:`, (err as Error).message);
      return { ok: false, description: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }

  sendMessage(chatId: number | string, text: string, options: SendMessageOptions = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...options,
    });
  }

  getUpdates(offset: number, timeoutSeconds = 30) {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
      (timeoutSeconds + 15) * 1000
    );
  }

  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.call('setMyCommands', { commands });
  }

  deleteWebhook(dropPendingUpdates = false) {
    return this.call('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  setWebhook(url: string, secretToken: string) {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'pre_checkout_query'],
    });
  }

  getMe() {
    return this.call<TelegramUser>('getMe');
  }
}
