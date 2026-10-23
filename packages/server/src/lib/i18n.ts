/**
 * Серверный i18n (P2.5, этап 2). Язык запроса: заголовок `X-Locale` (клиент
 * шлёт свой выбор) → `language_code` из Telegram initData → `ru`.
 *
 * `t()` читает локаль из AsyncLocalStorage: обёрнуты все route-хендлеры
 * (см. `onRoute` в index.ts), поэтому параллельные запросы с разными языками
 * не смешиваются. Словари — общие с клиентом (`@itsim/shared`).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyRequest } from 'fastify';
import { t as translate, isLocale, type Locale } from '@itsim/shared';

const localeStorage = new AsyncLocalStorage<Locale>();

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStorage.run(locale, fn);
}

export function currentLocale(): Locale {
  return localeStorage.getStore() ?? 'ru';
}

/** Перевод под язык текущего запроса. Ключ — исходная русская строка. */
export function t(key: string, params?: Record<string, unknown>): string {
  return translate(currentLocale(), key, params);
}

function telegramLanguage(request: FastifyRequest): string | undefined {
  const user = (request as { telegramUser?: { language_code?: string } }).telegramUser;
  return user?.language_code;
}

/** Язык запроса: X-Locale → язык Telegram → ru. */
export function requestLocale(request: FastifyRequest): Locale {
  const header = request.headers['x-locale'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (isLocale(fromHeader)) return fromHeader;
  const tg = telegramLanguage(request);
  if (tg && isLocale(tg.slice(0, 2))) return tg.slice(0, 2) as Locale;
  return 'ru';
}
