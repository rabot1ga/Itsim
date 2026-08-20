import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Persistent game state storage.
 *
 * MVP implementation: JSON file per user with atomic writes (tmp + rename),
 * so game state survives server restarts. The storage interface is narrow
 * enough to swap for PostgreSQL/Prisma later (see SPEC section 12).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// packages/server/data — same path in src/ and dist/ (services/ is one level deep)
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map<string, any>();

function stateFile(userId: string): string {
  return join(DATA_DIR, `${userId}.json`);
}

/**
 * Load saved state for a user (from cache or disk). Returns null if absent.
 */
export function loadState(userId: string): any | null {
  const cached = cache.get(userId);
  if (cached) return cached;

  const file = stateFile(userId);
  if (!existsSync(file)) return null;

  try {
    const state = JSON.parse(readFileSync(file, 'utf-8'));
    cache.set(userId, state);
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
