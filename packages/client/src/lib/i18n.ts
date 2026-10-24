/**
 * Клиентская обвязка i18n (P2.5, docs/PROPOSALS-2026-10-23-i18n.md).
 *
 * `t(key, params)` — gettext-стиль: ключ = исходная русская строка,
 * непереведённое возвращается как есть. Locale читается из localStorage
 * один раз при загрузке; смена языка перезагружает приложение (см. дизайн —
 * модульные константы вычисляются при импорте).
 */
import {
  t as translate,
  getStoredLocale,
  setStoredLocale,
  hasStoredLocale,
  setDisplayLocale,
  isLocale,
  LOCALES,
  type Locale,
} from '@itsim/shared';

export type { Locale };
export { LOCALES, isLocale, hasStoredLocale };

/** Имена языков — эндонимы (каждый на своём), не переводятся. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English (beta)',
};

const locale: Locale = getStoredLocale(); // смена языка = перезагрузка модулей
// Движок (shared) вычисляет display-тексты через dt() — сообщаем свою локаль.
setDisplayLocale(locale);

export function currentLocale(): Locale {
  return locale;
}

/** BCP-47 теги для `Intl.*` (этап 4: форматы чисел под язык интерфейса). */
const LOCALE_TAGS: Record<Locale, string> = { ru: 'ru-RU', en: 'en-US' };
export function localeTag(): string {
  return LOCALE_TAGS[locale];
}
/** Локализованный формат числа: разделители групп и десятичные под язык. */
export function fmtNumber(n: number): string {
  return new Intl.NumberFormat(localeTag()).format(n);
}
/** Деньги клиента: «12 345 ₽» (игра в целых). */
export function fmtMoney(n: number): string {
  return `${fmtNumber(Math.round(n))} ₽`;
}

/** Перевод под текущий язык. Ключ — исходная русская строка. */
export function t(key: string, params?: Record<string, unknown>): string {
  return translate(locale, key, params);
}

/**
 * React-хук для компонентов: возвращает `t`, привязанный к текущему
 * языку. Перерисовка не нужна — смена языка перезагружает страницу.
 */
export function useT(): typeof t {
  return t;
}

/** Смена языка: запомнить выбор и перезагрузить приложение. */
export function setLocale(next: Locale): void {
  if (next === locale) return;
  setStoredLocale(next);
  globalThis.location?.reload();
}
