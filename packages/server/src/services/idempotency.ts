/**
 * Idempotency for `/api/game/action`.
 *
 * The previous implementation kept a `Map` in the process: after a restart (or
 * on a second server instance) a retried request replayed the action and the
 * player paid twice. The keys now live inside the save itself — same lifetime
 * as the state they protect, and free of extra infrastructure.
 *
 * We store keys only, not responses: replaying a duplicate returns the CURRENT
 * state, which is exactly what the client needs to re-render, and keeps saves
 * small (a stored response snapshot would be ~10 KB each).
 */

/** how many recent keys to keep per player */
const MAX_KEYS = 64;
/** keys older than this are dropped (clients never retry a day later) */
const TTL_MS = 6 * 60 * 60 * 1000;

interface IdempotencyEntry {
  k: string;
  at: number;
  /** short human-readable message of the original action, replayed verbatim */
  m?: string;
}

interface WithIdempotency {
  _idem?: IdempotencyEntry[];
  [key: string]: any;
}

function entries(state: WithIdempotency): IdempotencyEntry[] {
  if (!Array.isArray(state._idem)) state._idem = [];
  return state._idem;
}

function prune(list: IdempotencyEntry[]): IdempotencyEntry[] {
  const cutoff = Date.now() - TTL_MS;
  const fresh = list.filter((e) => e && typeof e.k === 'string' && (e.at ?? 0) > cutoff);
  return fresh.length > MAX_KEYS ? fresh.slice(fresh.length - MAX_KEYS) : fresh;
}

/** Returns the stored entry when this key was already processed. */
export function findCompletedAction(state: WithIdempotency, key: string): IdempotencyEntry | null {
  const list = prune(entries(state));
  state._idem = list;
  return list.find((e) => e.k === key) ?? null;
}

/** Record a successfully applied action so a retry is a no-op. */
export function rememberAction(state: WithIdempotency, key: string, message?: string): void {
  const list = prune(entries(state));
  list.push({ k: key, at: Date.now(), m: message });
  state._idem = list.length > MAX_KEYS ? list.slice(list.length - MAX_KEYS) : list;
}

/** Internal bookkeeping must never reach the client. */
export function stripInternal<T extends Record<string, any>>(state: T): Omit<T, '_idem'> {
  const { _idem, ...rest } = state as any;
  return rest;
}
