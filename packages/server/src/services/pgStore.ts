/**
 * PostgreSQL-бэкенд хранилища (P2.6): Prisma engine-less клиент поверх нашего
 * SQL-адаптера (src/db/adapter.ts) — тот же код идёт на pg.Pool (прод) и на
 * pg-mem (тесты).
 *
 * Здесь нет миграций сейва (v4→v5) и кэша — это слой фасада (gameStore.ts):
 * бэкенд хранит и отдаёт байты состояния как есть.
 */
import { PrismaClient } from '../generated/prisma/client.js';
import { itsimAdapterFactory, type SqlExecutor } from '../db/adapter.js';
import type { PlayerBackend, PurchaseBackend, OfferBackend, OfferRecord } from './storeTypes.js';
import type { PurchaseRecord } from './storeTypes.js';

export interface PgBackendHandle {
  players: PlayerBackend;
  purchases: PurchaseBackend;
  offers: OfferBackend;
  /** залить SQL-структуру (src/db/migrations) */
  migrate(): Promise<void>;
  /** освободить соединения */
  close(): Promise<void>;
}

function rowToRecord(row: {
  chargeId: string;
  userId: string;
  productId: string;
  stars: number;
  at: Date;
  mock: boolean;
  refundedAt: Date | null;
}): PurchaseRecord {
  return {
    chargeId: row.chargeId,
    userId: row.userId,
    productId: row.productId,
    stars: row.stars,
    at: row.at.getTime(),
    ...(row.mock ? { mock: true } : {}),
    ...(row.refundedAt ? { refundedAt: row.refundedAt.getTime() } : {}),
  };
}

export function createPgBackend(executor: SqlExecutor, log: (msg: string) => void = () => {}): PgBackendHandle {
  const prisma = new PrismaClient({ adapter: itsimAdapterFactory(executor) });

  const players: PlayerBackend = {
    async get(userId) {
      const row = await prisma.player.findUnique({ where: { userId } });
      return row ? (row.state as Record<string, unknown>) : null;
    },
    async put(userId, state) {
      await prisma.player.upsert({
        where: { userId },
        create: { userId, state: state as object },
        update: { state: state as object, updatedAt: new Date() },
      });
    },
    async delete(userId) {
      await prisma.player.deleteMany({ where: { userId } });
    },
    async scan() {
      const rows = await prisma.player.findMany();
      return rows.map((r) => ({
        userId: r.userId,
        state: r.state as Record<string, unknown>,
        mtimeMs: r.updatedAt.getTime(),
      }));
    },
  };

  const purchases: PurchaseBackend = {
    async get(chargeId) {
      const row = await prisma.purchase.findUnique({ where: { chargeId } });
      return row ? rowToRecord(row) : null;
    },
    async byUser(userId) {
      const rows = await prisma.purchase.findMany({ where: { userId } });
      return rows.map(rowToRecord);
    },
    async put(record) {
      await prisma.purchase.upsert({
        where: { chargeId: record.chargeId },
        create: {
          chargeId: record.chargeId,
          userId: record.userId,
          productId: record.productId,
          stars: record.stars,
          at: new Date(record.at),
          mock: record.mock ?? false,
          refundedAt: record.refundedAt ? new Date(record.refundedAt) : null,
        },
        update: {
          refundedAt: record.refundedAt ? new Date(record.refundedAt) : null,
        },
      });
    },
  };

  return {
    players,
    purchases,
    // P2P-объявления — на сыром SQL: generated Prisma-клиент не пересобираем
    // (движки Prisma недоступны офлайн), DDL живёт в migrations/002_market_offers.sql.
    offers: rawSqlOfferBackend(executor),
    async migrate() {
      const { runMigrations } = await import('../db/migrate.js');
      await runMigrations(executor, log);
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}

function rowToOffer(row: Record<string, unknown>): OfferRecord {
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    itemId: String(row.item_id),
    price: Number(row.price),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    status: String(row.status) as OfferRecord['status'],
    ...(row.buyer_id ? { buyerId: String(row.buyer_id) } : {}),
    ...(row.sold_at != null ? { soldAt: Number(row.sold_at) } : {}),
  };
}

export function rawSqlOfferBackend(executor: SqlExecutor): OfferBackend {
  return {
    async get(id) {
      const res = await executor.query('SELECT * FROM market_offers WHERE id = $1', [id]);
      return res.rows[0] ? rowToOffer(res.rows[0]) : null;
    },
    async put(record) {
      await executor.query(
        `INSERT INTO market_offers (id, seller_id, item_id, price, created_at, expires_at, status, buyer_id, sold_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status, buyer_id = EXCLUDED.buyer_id, sold_at = EXCLUDED.sold_at`,
        [
          record.id,
          record.sellerId,
          record.itemId,
          record.price,
          record.createdAt,
          record.expiresAt,
          record.status,
          record.buyerId ?? null,
          record.soldAt ?? null,
        ]
      );
    },
    async listActive() {
      const res = await executor.query(
        "SELECT * FROM market_offers WHERE status = 'active' ORDER BY created_at DESC",
        []
      );
      return res.rows.map(rowToOffer);
    },
    async bySeller(sellerId) {
      const res = await executor.query('SELECT * FROM market_offers WHERE seller_id = $1 ORDER BY created_at DESC', [
        sellerId,
      ]);
      return res.rows.map(rowToOffer);
    },
  };
}
