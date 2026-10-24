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
const CYRILLIC = /[А-Яа-яЁё]/;

export function t(locale: Locale, key: string, params?: Record<string, unknown>): string {
  const dict = DICTIONARIES[locale] ?? {};
  let out = dict[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      // Строковые параметры с кириллицей переводятся тем же словарём:
      // имена контента внутри сообщений локализуются без ручных обёрток.
      let v = value;
      if (typeof v === 'string' && CYRILLIC.test(v)) v = dict[v] ?? v;
      out = out.split(`{${name}}`).join(String(v)); // как в шаблонных строках: undefined → 'undefined'
    }
  }
  return out;
}

/**
 * «Display»-перевод для текстов, которые вычисляет движок (не API-путь):
 * клиент ставит свою локаль при старте (`setDisplayLocale`). Вызов — только из
 * функций (не из const-инициализаторов: модульные константы замёрзнут).
 */
let displayLocale: Locale = DEFAULT_LOCALE;
export function setDisplayLocale(locale: Locale): void {
  displayLocale = locale;
}
export function dt(key: string, params?: Record<string, unknown>): string {
  return t(displayLocale, key, params);
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

/** Был ли на этом устройстве явный выбор языка (для подхвата из профиля). */
export function hasStoredLocale(): boolean {
  return storage()?.getItem(STORAGE_KEY) != null;
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

/**
 * Глубокий перевод JSON-значений (контент-бандл, сейв, ответы действий).
 * Строки с кириллицей ищутся в словаре; без перевода остаются как есть.
 * Ключи объектов и строки без кириллицы не трогаются.
 */
export function translateDeep<T>(value: T, locale: Locale): T {
  if (locale === DEFAULT_LOCALE) return value;
  const dict = DICTIONARIES[locale] ?? {};
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return CYRILLIC.test(v) ? (dict[v] ?? v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = walk(item);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
