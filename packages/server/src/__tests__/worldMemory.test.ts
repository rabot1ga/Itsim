import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * «Живой мир» (DESIGN-LIVING-WORLD, стадия 1 «Следы»): значимый акт
 * оставляет след в `state.memories`, компания копит стойкость. Закон 3 —
 * память видна: следы читаются прямо из сейва (Хроника покажет их позже).
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-mem-'));
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
): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/game/action',
    headers: { authorization: tma(id) },
    payload: { actionId, params },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

const CAREER_SETUP = {
  skills: { javascript: { level: 30, xp: 0 } },
  softSkills: {
    communication: { level: 10, xp: 0 },
    english: { level: 10, xp: 0 },
    time_management: { level: 3, xp: 0 },
  },
  reputation: 10,
};

describe('следы карьеры', () => {
  it('отклик оставляет след и копит стойкость компании', async () => {
    await reset(9101);
    await patch(9101, { ...CAREER_SETUP });
    const r = await act(9101, 'apply_job', { companyId: 'portal_2000' });
    expect(r.statusCode).toBe(200);
    const state = (await loadState('9101')) as any;
    expect(state.memories[0].kind).toBe('application');
    expect(state.memories[0].subject).toBe('company:portal_2000');
    expect(state.companyStanding.portal_2000.applied).toBe(1);
  });

  it('отзыв отклика тоже остаётся в памяти', async () => {
    await reset(9102);
    await patch(9102, {
      ...CAREER_SETUP,
      currentApplication: {
        companyId: 'portal_2000',
        position: 'Джуниор',
        grade: 'junior',
        status: 'interview_scheduled',
        matchScore: 1,
        interviewDay: 2,
        requirements: { javascript: 32 },
      },
    });
    const r = await act(9102, 'cancel_application');
    expect(r.statusCode).toBe(200);
    const state = (await loadState('9102')) as any;
    expect(state.memories[0].subject).toBe('company:portal_2000');
    expect(state.memories[0].text).toContain('передумал');
  });
});

describe('соперник (стадия 2)', () => {
  it('найм создаёт соперника, рост соперника виден в gap', async () => {
    await reset(9104);
    await patch(9104, {
      pendingOffers: [
        {
          companyId: 'portal_2000',
          position: 'Junior-разработчик',
          grade: 'junior',
          salary: 90_000,
          requirements: { javascript: 20 },
          expiresInDays: 5,
          interviewBar: 1,
          companyToxicity: 0,
        },
      ],
    });
    const r = await act(9104, 'accept_offer', { companyId: 'portal_2000' });
    expect(r.statusCode).toBe(200);
    const state = (await loadState('9104')) as any;
    expect(state.rival?.name).toBeTruthy();
    expect(typeof state.rival.progress).toBe('number');
    // найм — тоже след памяти
    expect(state.memories[0].kind).toBe('hire');
  });
});

describe('сиквелы (стадия 3)', () => {
  it('вечер с другом сажает затравку; созревший сиквел стреляет утром', async () => {
    await reset(9105);
    await patch(9105, { energy: 10 });
    await act(9105, 'spend_time_with_friend', { npcId: 'uni_friend' });
    let state = (await loadState('9105')) as any;
    expect(state.memorySeeds.map((s: any) => s.tag)).toContain('friend_recommendation');

    // заставляем созреть другую затравку (без when) и закрываем день
    state.memorySeeds = [
      ...state.memorySeeds.filter((s: any) => s.tag !== 'friend_recommendation'),
      { tag: 'client_returns', plantedDay: 1, dueDay: 1, expiresDay: 99 },
    ];
    await saveState('9105', state);
    const day = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(9105) },
    });
    expect(day.statusCode).toBe(200);
    state = (await loadState('9105')) as any;
    // сиквел сработал и потребил затравку
    expect(state.activeEventId).toBe('sequel_client_returns_01');
    expect(state.memorySeeds.map((s: any) => s.tag)).not.toContain('client_returns');
  });

  it('выбор события сажает затравку (choice.sequel)', async () => {
    await reset(9106);
    await patch(9106, {
      activeEventId: 'sequel_hr_second_chance_01',
      eventHistory: {},
      recentEventTags: [],
    });
    const r = await app.inject({
      method: 'POST',
      url: '/api/game/event-choice',
      headers: { authorization: tma(9106) },
      payload: { eventId: 'sequel_hr_second_chance_01', choiceIndex: 0 },
    });
    expect(r.statusCode).toBe(200);
    const state = (await loadState('9106')) as any;
    expect(state.memorySeeds.map((s: any) => s.tag)).toContain('hr_second_visit');
  });
});

describe('следы дружбы', () => {
  it('вечер с другом пишется следом', async () => {
    await reset(9103);
    await patch(9103, { energy: 10 });
    const r = await act(9103, 'spend_time_with_friend', { npcId: 'uni_friend' });
    expect(r.statusCode).toBe(200);
    const state = (await loadState('9103')) as any;
    expect(state.memories[0].kind).toBe('friend');
    expect(state.memories[0].subject).toBe('npc:uni_friend');
    // повтор в тот же день — не плодит дубли
    const again = await act(9103, 'spend_time_with_friend', { npcId: 'uni_friend' });
    expect(again.statusCode).toBe(400);
    expect((await loadState('9103')).memories.filter((m: any) => m.kind === 'friend')).toHaveLength(1);
  });
});
