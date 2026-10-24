/**
 * Persistent game state storage — фасад P2.6.
 *
 * Два бэкенда за одним узким интерфейсом:
 *   - JSON-файлы в DATA_DIR (дефолт: dev, обратная совместимость);
 *   - PostgreSQL + Prisma (`STORAGE=postgres` + `DATABASE_URL`, SPEC §12).
 *
 * Фасад держит то, что общее для обоих:
 *   1. кэш состояний (один запрос = load+save несколько раз, без похода в I/O);
 *   2. миграции сейва при чтении (`engine/migrations.ts`) + отложенная запись;
 *   3. подписки (`onStateSaved`) — leaderboard-индекс не сканирует данные на
 *      горячем пути.
 *
 * Интерфейс асинхронный с P2.6 (Prisma-клиент асинхронный): вызовы — в async-
 * хендлерах Fastify.
 */
import { migrateState, CURRENT_STATE_VERSION, clampStateAnomalies, detectDeltaAnomalies } from '@itsim/shared';
import { config } from '../config.js';
import type { PlayerBackend, PurchaseBackend, OfferBackend } from './storeTypes.js';
import {
  createJsonPlayerBackend,
  createJsonPurchaseBackend,
  createJsonOfferBackend,
  isStateFile,
} from './jsonStore.js';
import { logAnomaly } from './anomalyLog.js';

export type { PurchaseRecord } from './storeTypes.js';
export { isStateFile };

export type SaveListener = (userId: string, state: any) => void;
const listeners: SaveListener[] = [];

export function onStateSaved(listener: SaveListener): void {
  listeners.push(listener);
}

const cache = new Map<string, any>();

let players: PlayerBackend = createJsonPlayerBackend(config.dataDir);
let purchases: PurchaseBackend = createJsonPurchaseBackend(config.dataDir);
let offers: OfferBackend = createJsonOfferBackend(config.dataDir);

/**
 * Инициализация хранилища при старте процесса. Для PostgreSQL — создать пул,
 * прогнать SQL-миграции; для JSON — ничего. Вызывается из index.ts до listen.
 */
export async function initStorage(log: (msg: string) => void = console.log): Promise<void> {
  if (process.env.STORAGE !== 'postgres') return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('STORAGE=postgres requires DATABASE_URL');

  const pg = await import('pg');
  const { createPgBackend } = await import('./pgStore.js');
  const pool = new pg.default.Pool({ connectionString: url });
  const executor = {
    query: async (sql: string, args: unknown[]) => {
      const res = await pool.query(sql, args as unknown[]);
      return {
        rows: res.rows as Array<Record<string, unknown>>,
        fields: res.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rowCount: res.rowCount,
      };
    },
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql: string, args: unknown[]) => {
          const res = await client.query(sql, args as unknown[]);
          return {
            rows: res.rows as Array<Record<string, unknown>>,
            fields: res.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
            rowCount: res.rowCount,
          };
        },
        release: () => client.release(),
      };
    },
  };
  const backend = createPgBackend(executor, log);
  await backend.migrate();
  players = backend.players;
  purchases = backend.purchases;
  offers = backend.offers;
  pgBackends.push(backend);
  log('storage: PostgreSQL (Prisma)');
}

type Closable = { close: () => Promise<void> };
const pgBackends: Closable[] = [];

/** Остановка процесса: закрыть пул (тесты). */
export async function shutdownStorage(): Promise<void> {
  for (const b of pgBackends) await b.close();
  pgBackends.length = 0;
}

/** Тестовый хелпер: подменить бэкенд (pg-mem-интеграция) и сбросить кэш. */
export function __setBackendsForTests(
  playerBackend: PlayerBackend,
  purchaseBackend: PurchaseBackend,
  offerBackend?: OfferBackend
): void {
  players = playerBackend;
  purchases = purchaseBackend;
  if (offerBackend) offers = offerBackend;
  cache.clear();
}

/** Тестовый хелпер: доступ к бэкенду покупок (entitlements тоже его держит). */
export function __purchaseBackend(): PurchaseBackend {
  return purchases;
}

/** Доступ к реестру P2P-объявлений (marketplace P2P). */
export function __offerBackend(): OfferBackend {
  return offers;
}

/**
 * Load saved state for a user (cache → backend). Returns null if absent.
 * Applies save migrations and persists back when they changed something.
 */
export async function loadState(userId: string): Promise<any | null> {
  const cached = cache.get(userId);
  if (cached) return cached;

  let raw: Record<string, unknown> | null;
  try {
    raw = await players.get(userId);
  } catch (err) {
    console.error(`Failed to load state for user ${userId}:`, err);
    return null;
  }
  if (!raw) return null;

  const { state, applied, changed, fromFuture } = migrateState<any>(raw);

  if (fromFuture) {
    console.warn(
      `⚠ state for ${userId} has version ${(raw as any).version} > ${CURRENT_STATE_VERSION} (written by a newer build) — loaded as-is`
    );
    cache.set(userId, state);
    return state;
  }

  cache.set(userId, state);
  if (changed) {
    if (applied.length) console.log(`↻ migrated state ${userId}: ${applied.join(', ')}`);
    // запись миграции не должна ронять чтение: сейв валиден и в памяти
    try {
      await players.put(userId, state);
    } catch (err) {
      console.error(`Failed to persist migrated state for ${userId}:`, err);
    }
  }
  return state;
}

/**
 * Persist user state (cache update + backend write) and notify subscribers.
 */
export async function saveState(userId: string, state: any): Promise<void> {
  // Детекция аномалий (античит): жёсткие инварианты выравниваются, подозрительные
  // скачки между сохранениями попадают в журнал (см. engine/anomaly.ts).
  const prev = cache.get(userId);
  const anomalies = [...clampStateAnomalies(state), ...detectDeltaAnomalies(prev, state)];
  if (anomalies.length > 0) {
    state.anomalyFlags = (state.anomalyFlags ?? 0) + anomalies.length;
    logAnomaly(userId, anomalies);
  }
  cache.set(userId, state);
  try {
    await players.put(userId, state);
  } catch (err) {
    console.error(`Failed to save state for user ${userId}:`, err);
    throw err;
  }
  for (const listener of listeners) {
    try {
      listener(userId, state);
    } catch (err) {
      console.error('state listener failed:', err);
    }
  }
}

/** Remove user state (GDPR / reset). Платёжный журнал purchases не трогаем. */
export async function deleteState(userId: string): Promise<void> {
  cache.delete(userId);
  try {
    await players.delete(userId);
  } catch (err) {
    console.error(`Failed to delete state for user ${userId}:`, err);
  }
}

export async function hasState(userId: string): Promise<boolean> {
  if (cache.has(userId)) return true;
  return (await players.get(userId)) !== null;
}

/**
 * Async scan of every persisted save. Used by the leaderboard index (once per
 * TTL, never per request) — reads are non-blocking and corrupt rows are skipped.
 */
export async function scanStates(): Promise<Array<{ userId: string; state: any; mtimeMs: number }>> {
  try {
    const out = await players.scan();
    for (const row of out) {
      const cached = cache.get(row.userId);
      if (cached) row.state = cached;
    }
    return out;
  } catch (err) {
    console.error('scanStates failed:', err);
    return [];
  }
}

/** Test helper — drops the in-memory cache. */
export function clearCache(): void {
  cache.clear();
}
