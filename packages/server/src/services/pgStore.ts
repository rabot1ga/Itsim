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
import type { PlayerBackend, PurchaseBackend } from './storeTypes.js';
import type { PurchaseRecord } from './storeTypes.js';

export interface PgBackendHandle {
  players: PlayerBackend;
  purchases: PurchaseBackend;
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
    async migrate() {
      const { runMigrations } = await import('../db/migrate.js');
      await runMigrations(executor, log);
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}
