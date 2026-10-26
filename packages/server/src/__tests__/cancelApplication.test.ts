import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * E3 (ANALYSIS-2026-10-27): `cancel_application` — отмена отклика.
 * Раньше кейс жил только на сервере: брошенный квиз навсегда блокировал
 * новые отклики, отменить «передумал» было нельзя.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-cancel-'));
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

describe('cancel_application: отмена отклика', () => {
  it('без отклика отвечает отказом', async () => {
    await reset(801);
    const { status, body } = await act(801, 'cancel_application');
    expect(status).toBe(400);
    expect(body.error).toContain('Нет активного отклика');
  });

  it('отзывает отклик и сбрасывает брошенный квиз', async () => {
    await reset(802);
    await patch(802, {
      skills: { javascript: { level: 30, xp: 0 } },
      softSkills: {
        communication: { level: 10, xp: 0 },
        english: { level: 10, xp: 0 },
        time_management: { level: 3, xp: 0 },
      },
      reputation: 10,
      currentApplication: {
        companyId: 'portal_2000',
        position: 'Джуниор',
        grade: 'junior',
        status: 'interview_scheduled',
        matchScore: 1,
        interviewDay: 2,
        requirements: { javascript: 32 },
      },
      interviewSession: { questions: [], answers: [], correct: 0 },
    });

    const { status, body } = await act(802, 'cancel_application');
    expect(status).toBe(200);
    expect(body.state._lastEvent).toContain('отозван');

    const state = (await loadState('802')) as any;
    expect(state.currentApplication).toBe(null);
    expect(state.interviewSession).toBe(undefined);

    // блок снят: новый отклик больше не режется «активным откликом»
    const apply = await app.inject({
      method: 'POST',
      url: '/api/game/action',
      headers: { authorization: tma(802) },
      payload: { actionId: 'apply_job', params: { companyId: 'portal_2000' } },
    });
    expect(apply.statusCode).toBe(200);
    expect(apply.json().state.currentApplication?.status).not.toBe(undefined);
  });
});
