/**
 * Клиентская обвязка i18n (P2.5, docs/PROPOSALS-2026-10-23-i18n.md).
 *
 * `t(key, params)` — gettext-стиль: ключ = исходная русская строка,
 * непереведённое возвращается как есть. Locale читается из localStorage
 * один раз при загрузке; смена языка перезагружает приложение (см. дизайн —
 * модульные константы вычисляются при импорте).
 */
import { t as translate, getStoredLocale, setStoredLocale, isLocale, LOCALES, type Locale } from '@itsim/shared';

export type { Locale };
export { LOCALES, isLocale };

let locale: Locale = getStoredLocale();

export function currentLocale(): Locale {
  return locale;
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
