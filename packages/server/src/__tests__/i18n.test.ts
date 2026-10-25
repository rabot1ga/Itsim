import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Серверный i18n (P2.5, этап 2): сообщения ответа переводятся под язык
 * запроса — X-Locale → language_code из Telegram → ru. Ядро общее с
 * клиентом (@itsim/shared), словари тоже.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-i18n-'));
process.env.DATA_DIR = DATA_DIR;
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

let app: FastifyInstance;
let requestLocale: typeof import('../lib/i18n.js').requestLocale;
let runWithLocale: typeof import('../lib/i18n.js').runWithLocale;
let t: typeof import('../lib/i18n.js').t;

beforeAll(async () => {
  const { loadContent } = await import('../services/contentService.js');
  loadContent();
  const { buildServer } = await import('../index.js');
  const i18n = await import('../lib/i18n.js');
  requestLocale = i18n.requestLocale;
  runWithLocale = i18n.runWithLocale;
  t = i18n.t;
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function tma(user: Record<string, unknown>): string {
  const initData = `user=${encodeURIComponent(JSON.stringify(user))}`;
  return `tma ${initData}`;
}

describe('requestLocale', () => {
  it('X-Locale главнее языка Telegram, мусор игнорируется', () => {
    const req = (headers: Record<string, unknown>, telegramUser?: unknown) => ({ headers, telegramUser }) as never;
    expect(requestLocale(req({ 'x-locale': 'en' }))).toBe('en');
    expect(requestLocale(req({ 'x-locale': 'de' }, { language_code: 'en' }))).toBe('en');
    expect(requestLocale(req({ 'x-locale': ['ru'] }))).toBe('ru');
    expect(requestLocale(req({}, { language_code: 'en' }))).toBe('en');
    expect(requestLocale(req({}, { language_code: 'en-US' }))).toBe('en');
    expect(requestLocale(req({}, { language_code: 'de' }))).toBe('ru');
    expect(requestLocale(req({}))).toBe('ru');
  });

  it('t() внутри runWithLocale видит свою локаль даже при чередовании async', async () => {
    const seen = await Promise.all([
      (async () => {
        await new Promise((r) => setTimeout(r, 5));
        return runWithLocale('en', () => {
          const first = t('Новая жизнь началась!');
          return first;
        });
      })(),
      (async () => {
        await new Promise((r) => setTimeout(r, 1));
        return runWithLocale('ru', () => t('Новая жизнь началась!'));
      })(),
    ]);
    expect(seen[1]).toBe('Новая жизнь началась!'); // ru — ключ
    expect(seen[0]).toBe('A new life has begun!'); // en — из словаря
  });
});

describe('HTTP: контент-бандл переводится на границе API (onSend)', () => {
  it('X-Locale: en → названия контента в ответе переведены', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content/achievements', headers: { 'X-Locale': 'en' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.json());
    expect(body).toContain('A hundred days in IT');
    expect(body).not.toContain('Сто дней в IT');
  });

  it('без заголовка контент остаётся русским', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content/achievements' });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).toContain('Сто дней в IT');
  });
});

describe('HTTP: сообщения ответа под языком запроса', () => {
  it('X-Locale: en → английское сообщение (свежая игра)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/reset',
      headers: { authorization: tma({ id: 77, first_name: '', language_code: 'ru' }), 'X-Locale': 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toBe('A new life has begun!');
    expect(res.json().state.firstName).toBe('Player');
  });

  it('без X-Locale берётся язык Telegram', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/reset',
      headers: { authorization: tma({ id: 78, first_name: '', language_code: 'en' }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toBe('A new life has begun!');
  });

  it('дефолт — русский: ключ возвращается как есть', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/reset',
      headers: { authorization: tma({ id: 79, first_name: '' }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toBe('Новая жизнь началась!');
    expect(res.json().state.firstName).toBe('Игрок');
  });
});

describe('POST /api/game/language: выбор языка в профиле (P2.5, этап 3)', () => {
  it('сохраняет язык в сейв, валидирует мусор, без игры — 404', async () => {
    const headers = { authorization: tma({ id: 80, first_name: '' }) };
    const reset = await app.inject({ method: 'POST', url: '/api/game/reset', headers });
    expect(reset.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/language',
      headers,
      payload: { language: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.language).toBe('en');

    // выбор переживает следующую загрузку сейва
    const stateRes = await app.inject({ method: 'GET', url: '/api/game/state', headers });
    expect(stateRes.json().state.language).toBe('en');

    const bad = await app.inject({
      method: 'POST',
      url: '/api/game/language',
      headers,
      payload: { language: 'de' },
    });
    expect(bad.statusCode).toBe(400);

    const noGame = await app.inject({
      method: 'POST',
      url: '/api/game/language',
      headers: { authorization: tma({ id: 81, first_name: '' }) },
      payload: { language: 'en' },
    });
    expect(noGame.statusCode).toBe(404);
  });
});
