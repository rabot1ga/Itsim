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

/** Объявление P2P-витрины (эскроу-лайт): питомец в эскроу у записи, деньги покупателя — тоже. */
export interface OfferRecord {
  id: string;
  sellerId: string;
  itemId: string;
  /** Цена продажи (₽), внутри коридора offerPriceBounds. */
  price: number;
  createdAt: number;
  expiresAt: number;
  /**
   * active — на витрине; sold_escrow — куплено, деньги ждут продавца;
   * paid_out — продавец забрал; cancelled/expired — питомец вернулся продавцу.
   */
  status: 'active' | 'sold_escrow' | 'paid_out' | 'cancelled' | 'expired';
  buyerId?: string;
  soldAt?: number;
}

export interface OfferBackend {
  get(id: string): Promise<OfferRecord | null>;
  put(record: OfferRecord): Promise<void>;
  /** Активные объявления (для витрины), новые сверху. */
  listActive(): Promise<OfferRecord[]>;
  /** Все записи продавца (активные и история). */
  bySeller(sellerId: string): Promise<OfferRecord[]>;
  /** Тестовый хелпер JSON-бэкенда. */
  reset?(): void;
}
