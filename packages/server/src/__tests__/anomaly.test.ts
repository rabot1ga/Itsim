import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * Детекция аномалий в saveState (единая точка сохранения): инварианты
 * выравниваются, срабатывания пишутся в журнал и копятся в anomalyFlags.
 * Плюс per-user лимит на игровые мутации (429 от rate-limit).
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-anomaly-'));
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

describe('saveState: инварианты и журнал аномалий', () => {
  it('битый сейв выравнивается, anomalyFlags растёт, журнал пишется', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/reset',
      headers: { authorization: tma(801) },
    });
    expect(res.statusCode).toBe(200);

    const state = (await loadState('801')) as any;
    state.energy = 500;
    state.health = -10;
    await saveState('801', state);

    const after = (await loadState('801')) as any;
    expect(after.energy).toBeLessThanOrEqual(after.maxEnergy);
    expect(after.health).toBe(0);
    expect(after.anomalyFlags).toBeGreaterThan(0);

    const logFile = join(DATA_DIR, 'anomalies.ndjson');
    expect(existsSync(logFile)).toBe(true);
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.parse(lines[lines.length - 1]).uid).toBe('801');
  });

  it('нормальный сейв не создаёт аномалий', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/reset',
      headers: { authorization: tma(802) },
    });
    expect(res.statusCode).toBe(200);
    const after = (await loadState('802')) as any;
    expect(after.anomalyFlags ?? 0).toBe(0);
  });
});

describe('лимит на игровые мутации', () => {
  it('частые /action получают 429 (per-user, 60/мин)', async () => {
    await app.inject({ method: 'POST', url: '/api/game/reset', headers: { authorization: tma(803) } });
    const state = (await loadState('803')) as any;
    state.money = 10_000_000;
    state.energy = 10;
    await saveState('803', state);

    let saw429 = false;
    for (let i = 0; i < 70; i += 1) {
      // подзаряжаем энергию, чтобы отказы были от лимита, а не от «мало энергии»
      if (i % 5 === 0) {
        const s = (await loadState('803')) as any;
        s.energy = 10;
        await saveState('803', s);
      }
      const res = await app.inject({
        method: 'POST',
        url: '/api/game/action',
        headers: { authorization: tma(803) },
        payload: { actionId: 'study_english' },
      });
      if (res.statusCode === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
