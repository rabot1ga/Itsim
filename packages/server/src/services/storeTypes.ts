/**
 * Контракты бэкендов хранилища (P2.6): JSON-файлы или PostgreSQL.
 * Фасад (gameStore.ts / entitlements.ts) держит кэш, миграции сейва и
 * подписки поверх этих интерфейсов.
 */
/** Запись реестра покупок Telegram Stars (идемпотентность по chargeId). */
export interface PurchaseRecord {
  chargeId: string;
  userId: string;
  productId: string;
  stars: number;
  at: number;
  /** dev/mock purchase (ALLOW_MOCK_PAYMENTS) */
  mock?: boolean;
  refundedAt?: number;
}

export interface PlayerBackend {
  /** Сырое состояние как есть (без миграций сейва) или null. */
  get(userId: string): Promise<Record<string, unknown> | null>;
  put(userId: string, state: Record<string, unknown>): Promise<void>;
  delete(userId: string): Promise<void>;
  scan(): Promise<Array<{ userId: string; state: Record<string, unknown>; mtimeMs: number }>>;
}

export interface PurchaseBackend {
  get(chargeId: string): Promise<PurchaseRecord | null>;
  byUser(userId: string): Promise<PurchaseRecord[]>;
  put(record: PurchaseRecord): Promise<void>;
  /** Тестовый хелпер JSON-бэкенда: сброс ин-мемори реестра. */
  reset?(): void;
}
