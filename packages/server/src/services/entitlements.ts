import { t } from '../lib/i18n';
/**
 * Telegram Stars entitlements — фасад P2.6 поверх PurchaseBackend.
 *
 * Покупки записываются с идемпотентным `chargeId`: Telegram ретраит вебхуки,
 * повтор не должен выдавать вторую награду. Реестр — JSON-файл
 * `data/entitlements.json` (дефолт) или таблица `purchases` (STORAGE=postgres).
 * При GDPR-удалении игрока реестр сохраняется (retention платёжных документов).
 *
 * Гранты применяются к сейву игрока (косметика, бейджи, дни в банке).
 */
import { loadState, saveState, __purchaseBackend } from './gameStore.js';
import type { PurchaseRecord } from './storeTypes.js';
export type { PurchaseRecord } from './storeTypes.js';
export async function getPurchase(chargeId: string): Promise<PurchaseRecord | null> {
  return __purchaseBackend().get(chargeId);
}
export async function purchasesOf(userId: string): Promise<PurchaseRecord[]> {
  const all = await __purchaseBackend().byUser(userId);
  return all.filter((p) => !p.refundedAt);
}
export async function purchasesToday(userId: string, productId: string): Promise<number> {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return (await purchasesOf(userId)).filter((p) => p.productId === productId && p.at > dayAgo).length;
}
export async function hasProduct(userId: string, productId: string): Promise<boolean> {
  return (await purchasesOf(userId)).some((p) => p.productId === productId);
}
export interface GrantResult {
  granted: boolean;
  duplicate: boolean;
  applied: string[];
  record: PurchaseRecord;
}
/**
 * Record a payment and apply its grants to the player's save.
 * Idempotent by `chargeId`.
 */
export async function grantPurchase(params: {
  chargeId: string;
  userId: string;
  product: {
    id: string;
    stars: number;
    grants: any;
  };
  mock?: boolean;
}): Promise<GrantResult> {
  const { chargeId, userId, product } = params;
  const existing = await __purchaseBackend().get(chargeId);
  if (existing) {
    return { granted: false, duplicate: true, applied: [], record: existing };
  }
  const record: PurchaseRecord = {
    chargeId,
    userId,
    productId: product.id,
    stars: product.stars,
    at: Date.now(),
    ...(params.mock ? { mock: true } : {}),
  };
  await __purchaseBackend().put(record);
  const applied = await applyGrantsToState(userId, product.grants ?? {});
  return { granted: true, duplicate: false, applied, record };
}
/**
 * Apply grants to the persisted player state. Returns human-readable lines
 * describing what changed (used in the client toast / bot message).
 */
export async function applyGrantsToState(userId: string, grants: any): Promise<string[]> {
  const state = await loadState(userId);
  if (!state) return [];
  const applied: string[] = [];
  if (grants.bankedDays) {
    const before = state.bankedDays ?? 0;
    state.bankedDays = Math.min(7, before + grants.bankedDays);
    if (state.bankedDays > before) applied.push(t('+{p0} день в банке', { p0: state.bankedDays - before }));
  }
  if (Array.isArray(grants.cosmetics) && grants.cosmetics.length) {
    const owned = new Set<string>(Array.isArray(state.entitlements) ? state.entitlements : []);
    const items = new Set<string>(Array.isArray(state.items) ? state.items : []);
    const added = grants.cosmetics.filter((id: string) => !owned.has(id));
    for (const id of added) {
      owned.add(id);
      items.add(id);
    }
    state.entitlements = [...owned];
    // Косметика должна быть видимой: питомец (и другие потребители) читают items.
    state.items = [...items];
    if (added.length) applied.push(t('открыто питомцу: {p0}', { p0: added.join(', ') }));
  }
  if (grants.badge) {
    const badges = new Set<string>(Array.isArray(state.badges) ? state.badges : []);
    if (!badges.has(grants.badge)) {
      badges.add(grants.badge);
      applied.push(t('значок «{p0}»', { p0: grants.badge }));
    }
    state.badges = [...badges];
  }
  await saveState(userId, state);
  return applied;
}
/** Тестовый хелпер: сброс реестра покупок (JSON-бэкенд — ин-мемори). */
export async function resetEntitlements(): Promise<void> {
  const backend = __purchaseBackend() as {
    reset?: () => void;
  };
  backend.reset?.();
}
export async function markRefunded(chargeId: string): Promise<PurchaseRecord | null> {
  const backend = __purchaseBackend();
  const record = await backend.get(chargeId);
  if (!record) return null;
  const updated: PurchaseRecord = { ...record, refundedAt: Date.now() };
  await backend.put(updated);
  return updated;
}
