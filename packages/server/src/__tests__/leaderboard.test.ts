import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { ratingMetricOf } from '@itsim/shared';

/**
 * Leaderboard index: ranking, `isYou`, pagination, the honest board and the
 * metric boards (`?metric=`) that back the «Карьера / Навыки / Деньги / Rep»
 * tabs of the ТЗ.
 *
 * The old route read every save file synchronously per request and derived
 * `isYou` from a query parameter, which was always wrong in dev (ANALYSIS §7.1,
 * §7.4). These tests pin the new behaviour — and pin that the board sorts by
 * the *engine's* components, so a tab can not quietly become a second formula.
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

  it('сортирует по метрике: «Деньги» меняют порядок там, где итог ничья', async () => {
    const { store, index } = await freshModules();
    save(store, 'rich', { ratingScore: 200, money: 9_000_000 });
    save(store, 'poor', { ratingScore: 200, money: 1_000 });
    save(store, 'mid', { ratingScore: 500, money: 100_000 });

    const byRating = await index.getLeaderboard();
    expect(byRating.metric).toBe('rating');
    // 500 > 200, а ничья 200 (rich/poor) разрешается днём (одинаковый) и потом
    // id — то есть порядок на равенстве метрики детерминирован.
    expect(byRating.rows.map((r) => r.userId)).toEqual(['mid', 'poor', 'rich']);
    expect(byRating.rows[0].score).toBe(500);

    const byMoney = await index.getLeaderboard({ metric: 'money' });
    expect(byMoney.metric).toBe('money');
    expect(byMoney.rows.map((r) => r.userId)).toEqual(['rich', 'mid', 'poor']);
    // Место по вкладке = нормированная компонента движка, а не ещё один счёт.
    expect(byMoney.rows[0].score).toBe(
      ratingMetricOf(
        { grade: 'junior', skills: {}, money: 9_000_000, reputation: 0, achievements: [], housingLevel: 0 } as any,
        'money'
      )
    );
  });

  it('ничья по метрике не зависит от порядка обхода: день, потом id', async () => {
    const { store, index } = await freshModules();
    save(store, 'b', { ratingScore: 100, money: 5_000, currentDay: 4 });
    save(store, 'a', { ratingScore: 100, money: 5_000, currentDay: 9 });
    save(store, 'c', { ratingScore: 100, money: 5_000, currentDay: 9 });

    const first = await index.getLeaderboard({ metric: 'money' });
    const again = await index.getLeaderboard({ metric: 'money' });
    expect(first.rows.map((r) => r.userId)).toEqual(['a', 'c', 'b']);
    expect(again.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('сырой сейв без полей не превращает метрику в NaN', async () => {
    const { store, index } = await freshModules();
    // scanStates читает JSON без migrateState — поле может отсутствовать или
    // быть строкой; NaN в компараторе = произвольный (и неустойчивый) порядок.
    store.saveState('odd', {
      version: 2,
      telegramId: 'odd',
      firstName: 'Странный',
      currentDay: 3,
      skills: null,
      money: '100500',
      housingLevel: 9,
    });

    const page = await index.getLeaderboard({ metric: 'skills' });
    expect(page.total).toBe(1);
    expect(Number.isFinite(page.rows[0].score)).toBe(true);
    expect(page.rows[0].score).toBe(0);
    // housingLevel зажат в шкалу 0..4 → 100, а не «жильё 225 %».
    expect(page.rows[0].parts.housing).toBe(100);
    expect(page.rows[0].parts.money).toBeGreaterThan(0);
  });

  it('метрика из URL валидируется на роуте, а не молча откатывается', async () => {
    const { store } = await freshModules();
    save(store, '1', { ratingScore: 10 });

    const { leaderboardRoutes } = await import('../routes/leaderboard.js');
    const app = Fastify();
    await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });
    await app.ready();

    const bad = await app.inject({ method: 'GET', url: '/api/leaderboard/friends?metric=popugai' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('career');

    const ok = await app.inject({ method: 'GET', url: '/api/leaderboard/honest?metric=money' });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.metric).toBe('money');
    // внутренности индекса наружу не течёт: parts и userId — серверные поля
    expect(body.leaderboard[0]).not.toHaveProperty('parts');
    expect(body.leaderboard[0]).not.toHaveProperty('userId');
    expect(body.leaderboard[0].score).toBeGreaterThanOrEqual(0);

    await app.close();
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
