import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { EXTRA_ENERGY_COSTS, ACTION_MONEY_COSTS } from '../routes/game/shared.js';

/**
 * E4 (ANALYSIS-2026-10-27): инвариант «каталог клиента == сервер».
 * Цены и энергия действия живут в трёх местах (каталог клиента,
 * EXTRA_ENERGY_COSTS/ACTION_MONEY_COSTS, balance.xpSources) — этот тест не
 * даёт им разъезжаться: networking уже показывал 2⚡ при серверных 1⚡.
 */

const cataloguePath = fileURLToPath(new URL('../../../client/src/screens/actionCatalogue.ts', import.meta.url));

let balance: any;

beforeAll(async () => {
  const { loadContent } = await import('../services/contentService.js');
  const content = loadContent();
  balance = content.balance;
});

interface CatalogueEntry {
  id: string;
  energy: number;
  cost: number;
}

function parseCatalogue(): CatalogueEntry[] {
  const src = readFileSync(cataloguePath, 'utf-8');
  const entries: CatalogueEntry[] = [];
  for (const m of src.matchAll(/\{\s*id:\s*'([a-z_0-9]+)',([\s\S]*?)\}/g)) {
    const body = m[2];
    const energy = /energy:\s*(\d+)/.exec(body);
    const cost = /cost:\s*([\d_]+)/.exec(body);
    if (!energy || !cost) continue;
    entries.push({
      id: m[1],
      energy: Number(energy[1]),
      cost: Number(cost[1].replace(/_/g, '')),
    });
  }
  return entries;
}

function expectedEnergy(id: string): number {
  if (id.startsWith('study_')) return balance.xpSources?.[id]?.energy ?? 2;
  if (id === 'networking') return balance.networking?.energy ?? EXTRA_ENERGY_COSTS.networking;
  return EXTRA_ENERGY_COSTS[id] ?? 1;
}

function expectedCost(id: string): number {
  if (id.startsWith('study_')) return balance.xpSources?.[id]?.cost ?? 0;
  return ACTION_MONEY_COSTS[id] ?? 0;
}

describe('инвариант: каталог действий == серверные цены', () => {
  it('в каталоге есть все основные действия', () => {
    const ids = parseCatalogue().map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const must of [
      'study_youtube',
      'study_course',
      'study_advanced_course',
      'study_mentor',
      'work_task',
      'networking',
    ]) {
      expect(ids).toContain(must);
    }
  });

  it('энергия каждой кнопки совпадает с сервером', () => {
    for (const e of parseCatalogue()) {
      expect({ id: e.id, energy: e.energy }).toEqual({ id: e.id, energy: expectedEnergy(e.id) });
    }
  });

  it('цена каждой кнопки совпадает с сервером', () => {
    for (const e of parseCatalogue()) {
      expect({ id: e.id, cost: e.cost }).toEqual({ id: e.id, cost: expectedCost(e.id) });
    }
  });
});
