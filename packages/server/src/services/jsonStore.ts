/**
 * JSON-бэкенд хранилища (P2.6): то, чем хранилище было всегда — файл на
 * игрока в DATA_DIR + реестр покупок `entitlements.json`. Остаётся дефолтом
 * (dev, обратная совместимость); прод может уехать в PostgreSQL
 * (STORAGE=postgres, см. gameStore.ts).
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { PlayerBackend, PurchaseBackend, OfferBackend, OfferRecord } from './storeTypes.js';
import type { PurchaseRecord } from './storeTypes.js';

/** Файлы в DATA_DIR, которые не являются сейвами игроков. */
const NON_STATE_FILES = new Set(['entitlements.json', 'offers.json']);

export function isStateFile(name: string): boolean {
  return name.endsWith('.json') && !name.endsWith('.tmp') && !NON_STATE_FILES.has(name);
}

function atomicWrite(file: string, data: string, onFail: (err: unknown) => void): void {
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (err) {
    onFail(err);
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export function createJsonPlayerBackend(dataDir: string): PlayerBackend {
  mkdirSync(dataDir, { recursive: true });
  const stateFile = (userId: string) => join(dataDir, `${userId}.json`);

  return {
    async get(userId) {
      const file = stateFile(userId);
      if (!existsSync(file)) return null;
      try {
        return JSON.parse(readFileSync(file, 'utf-8'));
      } catch (err) {
        console.error(`Failed to read state for user ${userId}:`, err);
        return null;
      }
    },
    async put(userId, state) {
      let failed: unknown = null;
      atomicWrite(stateFile(userId), JSON.stringify(state), (err) => {
        failed = err;
        console.error(`Failed to save state for user ${userId}:`, err);
      });
      if (failed) throw failed;
    },
    async delete(userId) {
      try {
        const file = stateFile(userId);
        if (existsSync(file)) unlinkSync(file);
      } catch (err) {
        console.error(`Failed to delete state for user ${userId}:`, err);
      }
    },
    async scan() {
      let files: string[];
      try {
        files = await readdir(dataDir);
      } catch {
        return [];
      }
      const out: Array<{ userId: string; state: Record<string, unknown>; mtimeMs: number }> = [];
      const candidates = files.filter(isStateFile);
      const batchSize = 32;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (file) => {
            const userId = file.replace(/\.json$/, '');
            try {
              const info = await stat(join(dataDir, file));
              const state = JSON.parse(await readFile(join(dataDir, file), 'utf-8'));
              return { userId, state, mtimeMs: info.mtimeMs };
            } catch {
              return null;
            }
          })
        );
        for (const row of results) if (row && row.state) out.push(row);
      }
      return out;
    },
  };
}

interface Registry {
  version: number;
  charges: Record<string, PurchaseRecord>;
}

export function createJsonPurchaseBackend(dataDir: string): PurchaseBackend {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'entitlements.json');
  let registry: Registry | null = null;

  const load = (): Registry => {
    if (registry) return registry;
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
  };

  const persist = (): void => {
    atomicWrite(file, JSON.stringify(load(), null, 2), (err) => console.error('Failed to persist entitlements:', err));
  };

  return {
    async get(chargeId) {
      return load().charges[chargeId] ?? null;
    },
    async byUser(userId) {
      return Object.values(load().charges).filter((p) => p.userId === userId);
    },
    async put(record) {
      load().charges[record.chargeId] = record;
      persist();
    },
    /** Тестовый хелпер: сброс ин-мемори реестра. */
    reset() {
      registry = null;
    },
  };
}

interface OfferRegistry {
  version: number;
  offers: Record<string, OfferRecord>;
}

/**
 * Реестр P2P-объявлений `offers.json` (тот же приём, что `entitlements.json`):
 * один файл-реестр поверх atomicWrite. Питомцы «живут» в записях на время
 * активного объявления — это и есть эскроу-лок.
 */
export function createJsonOfferBackend(dataDir: string): OfferBackend {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'offers.json');
  let registry: OfferRegistry | null = null;

  const load = (): OfferRegistry => {
    if (registry) return registry;
    if (existsSync(file)) {
      try {
        registry = JSON.parse(readFileSync(file, 'utf-8')) as OfferRegistry;
        if (!registry.offers) registry.offers = {};
        return registry;
      } catch (err) {
        console.error('offers.json is corrupt — starting a fresh registry', err);
      }
    }
    registry = { version: 1, offers: {} };
    return registry;
  };

  const persist = (): void => {
    atomicWrite(file, JSON.stringify(load(), null, 2), (err) => console.error('Failed to persist offers:', err));
  };

  return {
    async get(id) {
      return load().offers[id] ?? null;
    },
    async put(record) {
      load().offers[record.id] = record;
      persist();
    },
    async listActive() {
      return Object.values(load().offers)
        .filter((o) => o.status === 'active')
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async bySeller(sellerId) {
      return Object.values(load().offers)
        .filter((o) => o.sellerId === sellerId)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async byBuyer(buyerId) {
      return Object.values(load().offers)
        .filter((o) => o.buyerId === buyerId)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    reset() {
      registry = null;
    },
  };
}
