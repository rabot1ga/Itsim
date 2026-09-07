import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { migrateState, CURRENT_STATE_VERSION } from '@itsim/shared';

/**
 * Persistent game state storage.
 *
 * MVP implementation: JSON file per user with atomic writes (tmp + rename),
 * so game state survives server restarts. The storage interface is narrow
 * enough to swap for PostgreSQL/Prisma later (see SPEC section 12).
 *
 * Two things happen on the read path besides reading:
 *   1. saves are migrated to `CURRENT_STATE_VERSION` (see engine/migrations.ts)
 *      and persisted back when they changed;
 *   2. subscribers (leaderboard index) are notified on every write, so nothing
 *      has to re-scan the data directory on a hot path.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// packages/server/data — same path in src/ and dist/ (services/ is one level deep)
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map<string, any>();

/** files in DATA_DIR that are not player saves */
const NON_STATE_FILES = new Set(['nft_registry.json', 'entitlements.json']);

export type SaveListener = (userId: string, state: any) => void;
const listeners: SaveListener[] = [];

export function onStateSaved(listener: SaveListener): void {
  listeners.push(listener);
}

export function getDataDir(): string {
  return DATA_DIR;
}

function stateFile(userId: string): string {
  return join(DATA_DIR, `${userId}.json`);
}

export function isStateFile(name: string): boolean {
  return name.endsWith('.json') && !name.endsWith('.tmp') && !NON_STATE_FILES.has(name);
}

/**
 * Load saved state for a user (from cache or disk). Returns null if absent.
 * Applies save migrations and rewrites the file when they changed something.
 */
export function loadState(userId: string): any | null {
  const cached = cache.get(userId);
  if (cached) return cached;

  const file = stateFile(userId);
  if (!existsSync(file)) return null;

  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    const { state, applied, changed, fromFuture } = migrateState<any>(raw);

    if (fromFuture) {
      console.warn(
        `⚠ state for ${userId} has version ${raw.version} > ${CURRENT_STATE_VERSION} (written by a newer build) — loaded as-is`
      );
      cache.set(userId, state);
      return state;
    }

    cache.set(userId, state);
    if (changed) {
      if (applied.length) console.log(`↻ migrated state ${userId}: ${applied.join(', ')}`);
      persist(userId, state);
    }
    return state;
  } catch (err) {
    console.error(`Failed to load state for user ${userId}:`, err);
    return null;
  }
}

/**
 * Persist user state (atomic write, cache update).
 */
export function saveState(userId: string, state: any): void {
  cache.set(userId, state);
  persist(userId, state);
  for (const listener of listeners) {
    try {
      listener(userId, state);
    } catch (err) {
      console.error('state listener failed:', err);
    }
  }
}

function persist(userId: string, state: any): void {
  const file = stateFile(userId);
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
  } catch (err) {
    console.error(`Failed to save state for user ${userId}:`, err);
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * Remove user state (GDPR / reset).
 */
export function deleteState(userId: string): void {
  cache.delete(userId);
  try {
    const file = stateFile(userId);
    if (existsSync(file)) unlinkSync(file);
  } catch (err) {
    console.error(`Failed to delete state for user ${userId}:`, err);
  }
}

export function hasState(userId: string): boolean {
  return cache.has(userId) || existsSync(stateFile(userId));
}

/**
 * Async scan of every persisted save. Used by the leaderboard index (once per
 * TTL, never per request) — reads are non-blocking and corrupt files are skipped.
 */
export async function scanStates(): Promise<Array<{ userId: string; state: any; mtimeMs: number }>> {
  let files: string[];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return [];
  }

  const out: Array<{ userId: string; state: any; mtimeMs: number }> = [];
  const batchSize = 32;
  const candidates = files.filter(isStateFile);

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (file) => {
        const userId = file.replace(/\.json$/, '');
        try {
          const cached = cache.get(userId);
          const info = await stat(join(DATA_DIR, file));
          if (cached) return { userId, state: cached, mtimeMs: info.mtimeMs };
          const state = JSON.parse(await readFile(join(DATA_DIR, file), 'utf-8'));
          return { userId, state, mtimeMs: info.mtimeMs };
        } catch {
          return null;
        }
      })
    );
    for (const row of results) if (row && row.state) out.push(row);
  }

  return out;
}

/** Test helper — drops the in-memory cache. */
export function clearCache(): void {
  cache.clear();
}
