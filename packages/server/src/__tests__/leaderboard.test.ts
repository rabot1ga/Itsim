import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Leaderboard index: ranking, `isYou`, pagination and the honest board.
 *
 * The old route read every save file synchronously per request and derived
 * `isYou` from a query parameter, which was always wrong in dev (ANALYSIS §7.1,
 * §7.4). These tests pin the new behaviour.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-leaderboard-'));
process.env.DATA_DIR = DATA_DIR;

afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

async function freshModules() {
  vi.resetModules();
  const store = await import('../services/gameStore');
  const index = await import('../services/leaderboardIndex');
  store.clearCache();
  index.resetLeaderboardIndex();
  return { store, index };
}

function save(store: any, id: string, patch: Record<string, any> = {}) {
  store.saveState(id, {
    version: 2,
    telegramId: id,
    firstName: `Игрок ${id}`,
    currentDay: 10,
    grade: 'junior',
    ratingScore: 100,
    items: [],
    ...patch,
  });
}

describe('leaderboard index', () => {
  beforeEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it('ranks players by rating, then by day', async () => {
    const { store, index } = await freshModules();
    save(store, '1', { ratingScore: 50 });
    save(store, '2', { ratingScore: 300 });
    save(store, '3', { ratingScore: 300, currentDay: 99 });

    const page = await index.getLeaderboard();
    expect(page.rows.map((r) => r.userId)).toEqual(['3', '2', '1']);
    expect(page.rows[0].rank).toBe(1);
    expect(page.total).toBe(3);
  });

  it('marks the authenticated player as `isYou`', async () => {
    const { store, index } = await freshModules();
    save(store, '4242', { ratingScore: 10 });
    save(store, '1', { ratingScore: 20 });

    const page = await index.getLeaderboard({ userId: '4242' });
    expect(page.rows.find((r) => r.userId === '4242')?.isYou).toBe(true);
    expect(page.rows.find((r) => r.userId === '1')?.isYou).toBe(false);
  });

  it('returns your own rank even when you are outside the page', async () => {
    const { store, index } = await freshModules();
    for (let i = 0; i < 25; i++) save(store, String(100 + i), { ratingScore: 1000 - i });
    save(store, 'me', { ratingScore: 1 });

    const page = await index.getLeaderboard({ limit: 5, userId: 'me' });
    expect(page.rows).toHaveLength(5);
    expect(page.rows.some((r) => r.userId === 'me')).toBe(false);
    expect(page.you?.rank).toBe(26);
    expect(page.you?.isYou).toBe(true);
  });

  it('paginates with limit/offset and caps the page size', async () => {
    const { store, index } = await freshModules();
    for (let i = 0; i < 10; i++) save(store, String(i), { ratingScore: i });

    const second = await index.getLeaderboard({ limit: 3, offset: 3 });
    expect(second.rows.map((r) => r.rank)).toEqual([4, 5, 6]);

    const capped = await index.getLeaderboard({ limit: 5000 });
    expect(capped.rows.length).toBeLessThanOrEqual(100);
  });

  it('filters booster owners out of the honest board', async () => {
    const { store, index } = await freshModules();
    save(store, 'clean', { ratingScore: 10 });
    save(store, 'boosted', { ratingScore: 999, items: ['energy_drink'] });

    const all = await index.getLeaderboard();
    expect(all.rows).toHaveLength(2);

    const honest = await index.getLeaderboard({ honestOnly: true });
    expect(honest.rows.map((r) => r.userId)).toEqual(['clean']);
  });

  it('picks up a newly saved player without re-scanning the disk', async () => {
    const { store, index } = await freshModules();
    save(store, '1', { ratingScore: 10 });
    await index.getLeaderboard(); // warms the index

    save(store, '2', { ratingScore: 999 });
    const page = await index.getLeaderboard();
    expect(page.rows[0].userId).toBe('2');
  });

  it('ignores the NFT registry and other non-save files', async () => {
    const { store, index } = await freshModules();
    save(store, '1');
    const { writeFileSync } = await import('fs');
    writeFileSync(join(DATA_DIR, 'nft_registry.json'), JSON.stringify({ mints: [] }));
    writeFileSync(join(DATA_DIR, 'entitlements.json'), JSON.stringify({ charges: {} }));

    const page = await index.getLeaderboard();
    expect(page.total).toBe(1);
  });
});
