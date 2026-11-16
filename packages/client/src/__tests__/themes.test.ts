// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PREF_KEYS, applyTheme, readTheme, setTheme } from '../lib/prefs';

/**
 * Темы оформления (стадия 4 «Колода»): ink — базовая чернильная, light —
 * светлая. Правда живёт в localStorage + data-theme на <html>.
 */
describe('prefs: тема', () => {
  afterEach(() => {
    localStorage.removeItem(PREF_KEYS.theme);
    delete document.documentElement.dataset.theme;
  });

  it('по умолчанию — ink, атрибут не вешается', () => {
    expect(readTheme()).toBe('ink');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('light вешает data-theme="light" и сохраняется', () => {
    setTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(readTheme()).toBe('light');
    expect(localStorage.getItem(PREF_KEYS.theme)).toBe('light');
  });

  it('возврат к ink снимает атрибут', () => {
    setTheme('light');
    setTheme('ink');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readTheme()).toBe('ink');
  });
});
