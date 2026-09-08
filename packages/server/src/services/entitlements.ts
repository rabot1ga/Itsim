import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { loadState, saveState } from './gameStore.js';

/**
 * Telegram Stars entitlements.
 *
 * Purchases are recorded in `data/entitlements.json` keyed by
 * `telegram_payment_charge_id`, which makes granting idempotent: Telegram
 * retries webhooks, and a retry must not hand out a second reward.
 *
 * The grant itself is applied to the player's save (cosmetic unlocks, badges,
 * banked days). The registry stays the audit log / refund source of truth.
 */

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

interface Registry {
  version: number;
  charges: Record<string, PurchaseRecord>;
}

const FILE = () => join(config.dataDir, 'entitlements.json');

let registry: Registry | null = null;

function load(): Registry {
  if (registry) return registry;
  mkdirSync(config.dataDir, { recursive: true });
  const file = FILE();
  if (existsSync(file)) {
    try {
      registry = JSON.parse(readFileSync(file, 'utf-8')) as Registry;
      if (!registry.charges) registry.charges = {};
      return registry;
    } catch (err) {
      console.error('entitlements.json is corrupt — starting a fresh registry', err);
    }
  }
  registry = { version: 1, charges: {} };
  return registry;
}

function persist(): void {
  const file = FILE();
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(load(), null, 2));
    renameSync(tmp, file);
  } catch (err) {
    console.error('Failed to persist entitlements:', err);
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export function getPurchase(chargeId: string): PurchaseRecord | null {
  return load().charges[chargeId] ?? null;
}

export function purchasesOf(userId: string): PurchaseRecord[] {
  return Object.values(load().charges).filter((p) => p.userId === userId && !p.refundedAt);
}

export function purchasesToday(userId: string, productId: string): number {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return purchasesOf(userId).filter((p) => p.productId === productId && p.at > dayAgo).length;
}

export function hasProduct(userId: string, productId: string): boolean {
  return purchasesOf(userId).some((p) => p.productId === productId);
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
export function grantPurchase(params: {
  chargeId: string;
  userId: string;
  product: { id: string; stars: number; grants: any };
  mock?: boolean;
}): GrantResult {
  const { chargeId, userId, product } = params;
  const reg = load();

  const existing = reg.charges[chargeId];
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
  reg.charges[chargeId] = record;
  persist();

  const applied = applyGrantsToState(userId, product.grants ?? {});
  return { granted: true, duplicate: false, applied, record };
}

/**
 * Apply grants to the persisted player state. Returns human-readable lines
 * describing what changed (used in the client toast / bot message).
 */
export function applyGrantsToState(userId: string, grants: any): string[] {
  const state = loadState(userId);
  if (!state) return [];

  const applied: string[] = [];

  if (grants.bankedDays) {
    const before = state.bankedDays ?? 0;
    state.bankedDays = Math.min(7, before + grants.bankedDays);
    if (state.bankedDays > before) applied.push(`+${state.bankedDays - before} день в банке`);
  }

  if (Array.isArray(grants.cosmetics) && grants.cosmetics.length) {
    const owned = new Set<string>(Array.isArray(state.entitlements) ? state.entitlements : []);
    const added = grants.cosmetics.filter((id: string) => !owned.has(id));
    for (const id of added) owned.add(id);
    state.entitlements = [...owned];
    if (added.length) applied.push(`открыто в гардеробе/комнате: ${added.join(', ')}`);
  }

  if (grants.badge) {
    const badges = new Set<string>(Array.isArray(state.badges) ? state.badges : []);
    if (!badges.has(grants.badge)) {
      badges.add(grants.badge);
      applied.push(`значок «${grants.badge}»`);
    }
    state.badges = [...badges];
  }

  saveState(userId, state);
  return applied;
}

export function markRefunded(chargeId: string): PurchaseRecord | null {
  const reg = load();
  const record = reg.charges[chargeId];
  if (!record) return null;
  record.refundedAt = Date.now();
  persist();
  return record;
}

/** Test helper. */
export function resetEntitlements(): void {
  registry = null;
}
