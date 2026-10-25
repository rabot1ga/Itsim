import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Автопостинг вех (README «В процессе»): сервер пишет посты в сейв на
 * мутациях (day/action), идемпотентно по id, и возвращает пост в сообщении.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-milestones-'));
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

describe('POST /api/game/action: вехи пишутся на мутации', () => {
  it('повышение и миллион — посты в ленту + «Веха» в сообщении, повтор не дублирует', async () => {
    await reset(501);
    await patch(501, { grade: 'junior', money: 1_200_000, currentDay: 12, energy: 10, maxEnergy: 10 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/action',
      headers: { authorization: tma(501) },
      payload: { actionId: 'study_english' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.state.milestones ?? []).map((m: { id: string }) => m.id);
    expect(ids).toContain('grade:junior');
    expect(ids).toContain('million');
    expect(body.state._lastEvent).toContain('Веха: Стал джун');
    expect(body.state._lastEvent).toContain('Первый миллион на 12-й день!');

    // повторная мутация — те же вехи, без дублей
    await patch(501, { energy: 10 });
    const again = await app.inject({
      method: 'POST',
      url: '/api/game/action',
      headers: { authorization: tma(501) },
      payload: { actionId: 'study_english' },
    });
    const ids2 = (again.json().state.milestones ?? []).map((m: { id: string }) => m.id);
    expect(new Set(ids2).size).toBe(ids2.length);
    expect(ids2.filter((i: string) => i === 'grade:junior')).toHaveLength(1);
  });
});

describe('POST /api/game/advance-day: вехи пишутся на дне', () => {
  it('новый грейд постится ровно один раз', async () => {
    await reset(502);
    await patch(502, { grade: 'senior', currentDay: 78 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(502) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const posts = (body.state.milestones ?? []) as Array<{ id: string; key: string; params?: Record<string, unknown> }>;
    expect(posts.map((m) => m.id)).toContain('grade:senior');
    const senior = posts.find((m) => m.id === 'grade:senior')!;
    expect(senior.key).toBe('Стал {p0} за {p1} {p2}!');
    expect(senior.params?.p0).toBe('сеньор');
    expect((body.messages ?? []).join('\n')).toContain('Веха: Стал сеньор');

    // следующий день ничего не дублирует
    const next = await app.inject({
      method: 'POST',
      url: '/api/game/advance-day',
      headers: { authorization: tma(502) },
    });
    const posts2 = (next.json().state.milestones ?? []) as Array<{ id: string }>;
    expect(posts2.filter((m) => m.id === 'grade:senior')).toHaveLength(1);
  });
});
