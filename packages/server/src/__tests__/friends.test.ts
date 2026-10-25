import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * D1 «Отношения работают» (25.10.2026):
 *   - «Провести время с другом»: энергия → отношения, раз в день на NPC;
 *   - реферальный бонус обоим при первом входе приглашённого;
 *   - дневные пассивки порогов: менторский XP Маши, стресс токсика.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-friends-'));
process.env.DATA_DIR = DATA_DIR;
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

let app: FastifyInstance;
let loadState: typeof import('../services/gameStore.js').loadState;
let saveState: typeof import('../services/gameStore.js').saveState;

beforeAll(async () => {
  const { loadContent } = await import('../services/contentService.js');
  loadContent();
  const store = await import('../services/gameStore.js');
  loadState = store.loadState;
  saveState = store.saveState;
  const { buildServer } = await import('../index.js');
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function tma(id: number): string {
  const initData = `user=${encodeURIComponent(JSON.stringify({ id, first_name: '', language_code: 'ru' }))}`;
  return `tma ${initData}`;
}

async function reset(id: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/reset',
    headers: { authorization: tma(id) },
  });
  expect(res.statusCode).toBe(200);
}

async function patch(id: number, over: Record<string, unknown>): Promise<void> {
  const state = (await loadState(String(id))) as Record<string, unknown>;
  Object.assign(state, over);
  await saveState(String(id), state as never);
}

async function act(
  id: number,
  actionId: string,
  params?: Record<string, unknown>
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/action',
    headers: { authorization: tma(id) },
    payload: { actionId, params },
  });
  return { status: res.statusCode, body: res.json() };
}

describe('«Провести время с другом»', () => {
  it('тратит энергию, поднимает отношения, второй раз в день закрыт', async () => {
    await reset(701);
    await patch(701, { energy: 10, relationships: { uni_friend: 20 } });

    const { status, body } = await act(701, 'spend_time_with_friend', { npcId: 'uni_friend' });
    expect(status).toBe(200);
    expect(body.state._lastEvent).toContain('Время с другом');

    const state = (await loadState('701')) as any;
    expect(state.relationships.uni_friend).toBe(28); // +8
    expect(state.energy).toBe(7); // −3

    const again = await act(701, 'spend_time_with_friend', { npcId: 'uni_friend' });
    expect(again.status).toBe(400);
    expect(again.body.error).toContain('уже виделись');
    expect(((await loadState('701')) as any).relationships.uni_friend).toBe(28);
  });

  it('с незнакомым NPC отвечает отказом', async () => {
    await reset(702);
    await patch(702, { energy: 10 });
    const { status, body } = await act(702, 'spend_time_with_friend', { npcId: 'stranger' });
    expect(status).toBe(400);
    expect(body.error).toContain('Такого друга');
  });
});

describe('реферальный бонус (обоим)', () => {
  it('приглашённый получает деньги и день банка, пригласивший — больше денег и счётчик', async () => {
    await reset(703); // пригласивший
    await reset(704); // приглашённый

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/referral',
      headers: { authorization: tma(704) },
      payload: { referrerTelegramId: '703' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state._lastEvent).toContain('приглашению');

    const invitee = (await loadState('704')) as any;
    const referrer = (await loadState('703')) as any;
    expect(invitee.meta.referralClaimed).toBe(true);
    expect(invitee.money).toBe(10_000 + 1500);
    expect(invitee.bankedDays).toBe(1);
    expect(referrer.meta.referralCount).toBe(1);
    expect(referrer.money).toBe(10_000 + 2500);

    // повторный клейм закрыт
    const again = await app.inject({
      method: 'POST',
      url: '/api/game/referral',
      headers: { authorization: tma(704) },
      payload: { referrerTelegramId: '703' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('на себя и от несуществующего игрока — отказ', async () => {
    await reset(705);
    const self = await app.inject({
      method: 'POST',
      url: '/api/game/referral',
      headers: { authorization: tma(705) },
      payload: { referrerTelegramId: '705' },
    });
    expect(self.statusCode).toBe(400);

    const ghost = await app.inject({
      method: 'POST',
      url: '/api/game/referral',
      headers: { authorization: tma(705) },
      payload: { referrerTelegramId: '7770001' },
    });
    expect(ghost.statusCode).toBe(404);
  });
});

describe('дневные пассивки порогов', () => {
  it('Маша ≥ 40 приносит менторский XP по каденсу', async () => {
    await reset(706);
    await patch(706, {
      currentDay: 11, // завтра будет 12: 12 % 3 === 0
      relationships: { junior_colleague: 40 },
      mainSkillId: 'javascript',
      skills: { javascript: { level: 5, xp: 0 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(706) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json().messages ?? []).join('\n')).toContain('Маша пришла с вопросом');

    const state = (await loadState('706')) as any;
    expect(state.skills.javascript.xp).toBeGreaterThan(0);
  });

  it('токсик ≤ −30 каждый день бьёт по мотивации', async () => {
    await reset(707);
    await patch(707, {
      currentDay: 11,
      motivation: 60,
      relationships: { toxic_senior: -30 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(707) },
    });
    expect((res.json().messages ?? []).join('\n')).toContain('Дмитрий Борисович');
    const state = (await loadState('707')) as any;
    expect(state.motivation).toBeLessThan(60);
  });

  it('тимлид ≥ 60 гасит одно предупреждение из событий', async () => {
    await reset(708);
    await patch(708, {
      jobWarnings: 0,
      relationships: { teamlead: 60 },
    });
    // выдаём предупреждение через эффект события (тот же путь, что и у выбора)
    const { applyEventEffects } = await import('@itsim/shared');
    const state = (await loadState('708')) as any;
    const next = applyEventEffects(state, { effects: { jobWarnings: 2 } } as never);
    expect(next.jobWarnings).toBe(1); // 2 − 1 (тимлид заступился)

    const plain = applyEventEffects({ ...state, relationships: {} }, { effects: { jobWarnings: 2 } } as never);
    expect(plain.jobWarnings).toBe(2);
  });
});
