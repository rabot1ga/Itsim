import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';

/**
 * PostgreSQL-бэкенд (P2.6) на pg-mem: та же SQL-структура и тот же Prisma-клиент
 * через itsimAdapterFactory. pg-mem не умеет нативный wire-протокол, поэтому
 * исполнитель здесь — `new (db.adapters.createPg().Pool)()`: он сам интерполирует
 * $N-параметры (replaceQueryArgs$) и гоняет SQL по db.public.
 */

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  fields: Array<{ name: string; dataTypeID?: number }>;
  rowCount?: number | null;
};

type Ctx = {
  store: typeof import('../services/gameStore');
  entitlements: typeof import('../services/entitlements');
  backend: ReturnType<typeof import('../services/pgStore').createPgBackend>;
  query: (sql: string, args?: unknown[]) => Promise<QueryResult>;
};

let ctx: Ctx;

async function boot(): Promise<Ctx> {
  vi.resetModules();
  const db = newDb();
  const { Pool } = db.adapters.createPg() as unknown as {
    Pool: new () => { query: (sql: string, args?: unknown[]) => Promise<QueryResult> };
  };
  const pool = new Pool();
  // pg-mem не парсит WHERE в ON CONFLICT ... DO UPDATE (Prisma queryCompiler
  // всегда добавляет `WHERE (pk = $N AND 1=1)`); в проде (настоящий PG) он есть.
  const shim = (sql: string) =>
    sql.replace(/ WHERE \("public"\."\w+"\."\w+" = \$\d+ AND 1=1\)/g, '').replace(/"public"\./g, '');
  const query = (sql: string, args: unknown[] = []) => pool.query(shim(sql), args);
  const executor = { query };
  const pgStore = await import('../services/pgStore');
  const backend = pgStore.createPgBackend(executor);
  await backend.migrate();
  const store = await import('../services/gameStore');
  const entitlements = await import('../services/entitlements');
  store.__setBackendsForTests(backend.players, backend.purchases);
  return { store, entitlements, backend, query };
}

beforeEach(async () => {
  ctx = await boot();
});

describe('pg-mem: миграции SQL', () => {
  it('создаёт players/purchases/market_offers и учитывает версии', async () => {
    const tables = await ctx.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toContain('players');
    expect(names).toContain('purchases');
    expect(names).toContain('market_offers');
    expect(names).toContain('schema_migrations');
    const ver = await ctx.query('SELECT id FROM schema_migrations ORDER BY id');
    expect(ver.rows.map((r) => r.id)).toEqual(['001_init.sql', '002_market_offers.sql', '003_market_offer_rating.sql']);
  });

  it('повторный запуск не падает', async () => {
    await ctx.backend.migrate();
  });
});

describe('pg-mem: P2P-объявления (raw SQL)', () => {
  it('roundtrip записи объявления', async () => {
    const offers = ctx.backend.offers;
    const rec = {
      id: 'off-1',
      sellerId: '1',
      itemId: 'pet_fox',
      price: 95000,
      createdAt: 1_700_000_000_000,
      expiresAt: 1_700_172_800_000,
      status: 'active' as const,
    };
    await offers.put(rec);
    expect(await offers.get('off-1')).toEqual(rec);
    expect(await offers.listActive()).toEqual([rec]);
    expect(await offers.bySeller('1')).toEqual([rec]);
    expect(await offers.byBuyer('2')).toEqual([]);
    rec.status = 'sold_escrow';
    await offers.put({ ...rec, buyerId: '2', soldAt: 1_700_000_100_000 });
    const sold = await offers.get('off-1');
    expect(sold?.status).toBe('sold_escrow');
    expect(sold?.buyerId).toBe('2');
    expect(await offers.listActive()).toEqual([]);
    const bought = await offers.byBuyer('2');
    expect(bought).toHaveLength(1);
    expect(bought[0].id).toBe('off-1');
    // оценка поверх проданной записи (upsert обновляет buyer_rating)
    await offers.put({ ...bought[0], buyerRating: 5 });
    expect((await offers.get('off-1'))?.buyerRating).toBe(5);
  });
});

describe('pg-mem: игроки', () => {
  const state = () => ({
    version: 2,
    telegramId: '1',
    firstName: 'Тест',
    currentDay: 3,
    grade: 'middle',
    money: 100,
    items: [],
  });

  it('put → load → has → scan → delete', async () => {
    await ctx.store.saveState('1', state());
    expect(await ctx.store.hasState('1')).toBe(true);

    const loaded = await ctx.store.loadState('1');
    expect(loaded.firstName).toBe('Тест');
    expect(loaded.currentDay).toBe(3);

    const all = await ctx.store.scanStates();
    expect(all.map((s) => s.userId)).toContain('1');
    expect(all.find((s) => s.userId === '1')!.mtimeMs).toBeGreaterThan(0);

    await ctx.store.saveState('1', { ...state(), money: 999 });
    const again = await ctx.store.loadState('1');
    expect(again.money).toBe(999);

    await ctx.store.deleteState('1');
    expect(await ctx.store.hasState('1')).toBe(false);
    expect(await ctx.store.loadState('1')).toBeNull();
  });

  it('loadState применяет миграции сейва (старая запись)', async () => {
    await ctx.store.saveState('2', { version: 1, telegramId: '2', firstName: 'Старый' });
    // миграции применяются при чтении с бэкенда; кэш хранит как записано
    ctx.store.clearCache();
    const loaded = await ctx.store.loadState('2');
    // migrateState достраивает недостающие поля
    expect(loaded.version).toBeGreaterThanOrEqual(2);
    expect(loaded.currentDay).toBeDefined();
    expect(Array.isArray(loaded.items)).toBe(true);
  });
});

describe('pg-mem: покупки', () => {
  const product = { id: 'banked_day', stars: 50, grants: { bankedDays: 1 } };

  it('grant → идемпотентность → markRefunded', async () => {
    const rec = await ctx.entitlements.grantPurchase({
      chargeId: 'ch_1',
      userId: '1',
      product,
    });
    expect(rec.duplicate).toBe(false);
    expect(rec.record.productId).toBe('banked_day');
    expect(await ctx.entitlements.hasProduct('1', 'banked_day')).toBe(true);
    expect(await ctx.entitlements.purchasesToday('1', 'banked_day')).toBe(1);

    const again = await ctx.entitlements.grantPurchase({
      chargeId: 'ch_1',
      userId: '1',
      product,
    });
    expect(again.duplicate).toBe(true);
    expect(await ctx.entitlements.purchasesOf('1')).toHaveLength(1);

    const refunded = await ctx.entitlements.markRefunded('ch_1');
    expect(refunded).not.toBeNull();
    expect(refunded!.refundedAt).toBeDefined();
    // возврат скрывает покупку из owned-выборок
    expect(await ctx.entitlements.hasProduct('1', 'banked_day')).toBe(false);
  });

  it('grant применяет grants к сейву игрока', async () => {
    await ctx.store.saveState('5', { version: 2, bankedDays: 0, items: [] });
    await ctx.entitlements.grantPurchase({
      chargeId: 'ch_2',
      userId: '5',
      product,
    });
    const after = await ctx.store.loadState('5');
    expect(after.bankedDays).toBe(1);
  });
});
