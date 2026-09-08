import { describe, it, expect, afterAll, vi } from 'vitest';
import { createHmac } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';

/**
 * Telegram initData validation + the service API the bot talks to.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-auth-'));
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

const BOT_TOKEN = '123456:TEST-TOKEN';
const ADMIN_TOKEN = 'super-secret-admin';

/** Build a valid initData string exactly the way Telegram does. */
function signInitData(user: Record<string, any>, botToken = BOT_TOKEN, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAE',
    user: JSON.stringify(user),
  });
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function withEnv(env: Record<string, string>) {
  vi.resetModules();
  process.env.DATA_DIR = DATA_DIR;
  process.env.BOT_TOKEN = '';
  process.env.ADMIN_TOKEN = '';
  Object.assign(process.env, env);
  return {
    auth: await import('../middleware/telegramAuth'),
    admin: await import('../routes/admin'),
    store: await import('../services/gameStore'),
  };
}

describe('Telegram initData validation', () => {
  it('accepts data signed with the bot token', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    const user = auth.validateInitData(signInitData({ id: 4242, first_name: 'Tester' }));
    expect(user?.id).toBe(4242);
  });

  it('rejects a tampered payload', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    const initData = signInitData({ id: 4242, first_name: 'Tester' });
    const tampered = initData.replace('4242', '9999');
    expect(auth.validateInitData(tampered)).toBeNull();
  });

  it('rejects data signed with a different token', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    expect(auth.validateInitData(signInitData({ id: 1, first_name: 'X' }, 'other:token'))).toBeNull();
  });

  it('rejects data older than the TTL', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    const old = Math.floor(Date.now() / 1000) - 90_000;
    expect(auth.validateInitData(signInitData({ id: 1, first_name: 'X' }, BOT_TOKEN, old))).toBeNull();
  });

  it('rejects a request with an unknown auth scheme', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    const app = Fastify();
    app.get('/probe', { preHandler: auth.telegramAuthHook }, async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/probe', headers: { authorization: 'Basic xyz' } });
    expect(res.statusCode).toBe(401);
  });

  it('requires authorization in production mode', async () => {
    const { auth } = await withEnv({ BOT_TOKEN });
    const app = Fastify();
    app.get('/probe', { preHandler: auth.telegramAuthHook }, async () => ({ ok: true }));
    await app.ready();

    expect((await app.inject({ method: 'GET', url: '/probe' })).statusCode).toBe(401);
  });

  it('keeps the parsed identity in dev mode instead of collapsing everyone into id=1', async () => {
    const { auth } = await withEnv({});
    const app = Fastify();
    app.get('/probe', { preHandler: auth.telegramAuthHook }, async (request) => ({
      id: (request as any).telegramUser.id,
    }));
    await app.ready();

    const initData = signInitData({ id: 4242, first_name: 'Tester' });
    const res = await app.inject({ method: 'GET', url: '/probe', headers: { authorization: `tma ${initData}` } });
    expect(res.json().id).toBe(4242);
  });
});

describe('admin API (used by the bot)', () => {
  async function buildAdminApp(env: Record<string, string> = { ADMIN_TOKEN }) {
    const { admin, store } = await withEnv(env);
    const app = Fastify();
    await app.register(admin.adminRoutes, { prefix: '/api/admin' });
    await app.ready();
    store.clearCache();
    return { app, store };
  }

  it('is disabled without ADMIN_TOKEN', async () => {
    const { app } = await buildAdminApp({});
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1/summary' });
    expect(res.statusCode).toBe(503);
  });

  it('rejects a wrong token', async () => {
    const { app } = await buildAdminApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users/1/summary',
      headers: { 'x-admin-token': 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns a player summary', async () => {
    const { app, store } = await buildAdminApp();
    store.saveState('777', {
      version: 2,
      telegramId: '777',
      firstName: 'Женя',
      currentDay: 12,
      grade: 'middle',
      money: 120000,
      ratingScore: 321.4,
      bankedDays: 3,
      energy: 6,
      maxEnergy: 11,
      health: 70,
      motivation: 55,
      achievements: ['a', 'b'],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users/777/summary',
      headers: { 'x-admin-token': ADMIN_TOKEN },
    });
    const body = res.json();
    expect(body.name).toBe('Женя');
    expect(body.grade).toBe('middle');
    expect(body.rating).toBe(321);
    expect(body.energy).toBe('6/11');
    expect(body.achievements).toBe(2);
  });

  it('404s for a player without a save', async () => {
    const { app } = await buildAdminApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users/nobody/summary',
      headers: { 'x-admin-token': ADMIN_TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a player on request (GDPR)', async () => {
    const { app, store } = await buildAdminApp();
    store.saveState('999', { version: 2, telegramId: '999', currentDay: 1 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/users/999',
      headers: { 'x-admin-token': ADMIN_TOKEN },
    });
    expect(res.json()).toEqual({ ok: true, deleted: true });
    expect(store.loadState('999')).toBeNull();
  });

  it('claims nudge candidates once and marks them as notified', async () => {
    const { app, store } = await buildAdminApp();
    store.saveState('n1', { version: 2, telegramId: 'n1', firstName: 'Полный банк', currentDay: 5, bankedDays: 7 });
    store.saveState('n2', { version: 2, telegramId: 'n2', firstName: 'Активный', currentDay: 5, bankedDays: 1 });

    const call = () =>
      app.inject({
        method: 'POST',
        url: '/api/admin/nudges',
        headers: { 'x-admin-token': ADMIN_TOKEN },
        payload: { minBankedDays: 6 },
      });

    const first = (await call()).json();
    expect(first.nudges.map((n: any) => n.userId)).toEqual(['n1']);

    // second call within the cooldown yields nobody — no double notifications
    const second = (await call()).json();
    expect(second.nudges).toHaveLength(0);
  });

  it('never nudges a player who already finished their run', async () => {
    const { app, store } = await buildAdminApp();
    store.saveState('done', {
      version: 2,
      telegramId: 'done',
      currentDay: 300,
      bankedDays: 7,
      careerEnding: 'burnout',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/nudges',
      headers: { 'x-admin-token': ADMIN_TOKEN },
      payload: { minBankedDays: 6 },
    });
    expect(res.json().nudges).toHaveLength(0);
  });
});
