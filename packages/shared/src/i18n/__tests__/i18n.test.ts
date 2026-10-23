import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  t,
  dt,
  translateDeep,
  setDisplayLocale,
  LOCALES,
  DEFAULT_LOCALE,
  getStoredLocale,
  setStoredLocale,
  coverage,
} from '../index';

const STORAGE_KEY = 'itsim.locale';

describe('i18n core', () => {
  it('exposes the locale set and defaults to Russian', () => {
    expect(LOCALES).toEqual(['ru', 'en']);
    expect(DEFAULT_LOCALE).toBe('ru');
  });

  it('ru falls back to the key (keys are source Russian strings)', () => {
    expect(t('ru', 'Мой день')).toBe('Мой день');
    expect(t('ru', 'Строка без перевода')).toBe('Строка без перевода');
  });

  it('en translates known keys and falls back to the key otherwise', () => {
    expect(t('en', 'Магазин')).toBe('Shop');
    expect(t('en', 'Нет такого ключа в словаре')).toBe('Нет такого ключа в словаре');
  });

  it('interpolates {params} like template literals', () => {
    expect(t('ru', 'Мне {n} лет', { n: 30 })).toBe('Мне 30 лет');
    expect(t('en', '{p0} млн', { p0: 5 })).toBe('5M');
    // отсутствующее значение ведёт себя как в шаблонной строке
    expect(t('ru', 'Значение: {x}', { x: undefined })).toBe('Значение: undefined');
  });

  it('coverage() reports the translated share for a locale', () => {
    const keys = ['Мой день', 'Ключ без перевода'];
    expect(coverage(keys, 'en')).toEqual({ total: 2, translated: 0, missing: keys });
    const ru = coverage(keys, 'ru');
    expect(ru.total).toBe(2);
    expect(ru.translated).toBe(2);
    expect(ru.missing).toEqual([]);
  });

  describe('stored locale (guarded)', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', undefined);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('falls back to default without localStorage', () => {
      expect(getStoredLocale()).toBe('ru');
    });

    it('rejects unknown values', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      });
      expect(getStoredLocale()).toBe('ru');
      store.set(STORAGE_KEY, 'de');
      expect(getStoredLocale()).toBe('ru');
      store.set(STORAGE_KEY, 'en');
      expect(getStoredLocale()).toBe('en');
      setStoredLocale('ru');
      expect(store.get(STORAGE_KEY)).toBe('ru');
    });
  });
});

describe('i18n params + display + deep translate', () => {
  it('строковые параметры с кириллицей переводятся тем же словарём', () => {
    // имена контента внутри сообщений локализуются без ручных обёрток
    expect(t('en', '🛒 Куплено: {p0}', { p0: 'Кофемашина' })).toBe('🛒 Bought: Coffee machine');
    expect(t('ru', '🛒 Куплено: {p0}', { p0: 'Кофемашина' })).toBe('🛒 Куплено: Кофемашина');
  });

  it('dt() следует display-локали', () => {
    setDisplayLocale('en');
    expect(dt('Магазин')).toBe('Shop');
    setDisplayLocale('ru');
    expect(dt('Магазин')).toBe('Магазин');
  });

  it('translateDeep переводит строки в объектах и массивах, ru — идентичность', () => {
    const payload = { items: [{ name: 'Кофемашина', id: 'coffee' }], note: 'Все', raw: 'ASCII' };
    const en = translateDeep(payload, 'en');
    expect(en.items[0].name).toBe('Coffee machine');
    expect(en.items[0].id).toBe('coffee');
    expect(en.note).toBe('All');
    expect(en.raw).toBe('ASCII');
    expect(translateDeep(payload, 'ru')).toEqual(payload);
  });
});
