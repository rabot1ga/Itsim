/**
 * Инфраструктура словарей (P2.5, docs/PROPOSALS-2026-10-23-i18n.md).
 *
 * gettext-стиль: **ключ — исходная русская строка**. Непереведённое
 * отображается как есть (fallback = ключ), поэтому миграция механическая,
 * а частичный словарь безопасен. Параметры шаблонов — `{name}`.
 *
 * Дефолт `ru`: продукт RU-первичный, юниты/e2e полагаются на русский текст.
 * Смена языка — явное действие пользователя (localStorage + перезагрузка).
 */
import { en } from './en';

export type Locale = 'ru' | 'en';

export const LOCALES: readonly Locale[] = ['ru', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'ru';
const STORAGE_KEY = 'itsim.locale';

/** Все словари. `ru` не нужен: ключи и есть русский текст. */
export const DICTIONARIES: Record<Locale, Record<string, string>> = {
  ru: {},
  en,
};

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

/**
 * Перевод строки-ключа с параметрами. Неизвестный ключ и отсутствующий
 * параметр не роняют вывод: ключ возвращается как есть, `{name}` остаётся.
 */
export function t(locale: Locale, key: string, params?: Record<string, unknown>): string {
  const dict = DICTIONARIES[locale] ?? {};
  let out = dict[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.split(`{${name}}`).join(String(value)); // как в шаблонных строках: undefined → 'undefined'
    }
  }
  return out;
}

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null; // приватный режим / node без localStorage
  }
}

export function getStoredLocale(): Locale {
  const raw = storage()?.getItem(STORAGE_KEY);
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  storage()?.setItem(STORAGE_KEY, locale);
}

/**
 * Доля переведённых ключей для словаря — отчёт `i18n:coverage`. Для `ru`
 * покрытие полное по построению: ключи и есть русский текст.
 */
export function coverage(keys: string[], locale: Locale): { total: number; translated: number; missing: string[] } {
  if (locale === DEFAULT_LOCALE) return { total: keys.length, translated: keys.length, missing: [] };
  const dict = DICTIONARIES[locale] ?? {};
  const missing = keys.filter((k) => !(k in dict));
  return { total: keys.length, translated: keys.length - missing.length, missing };
}
