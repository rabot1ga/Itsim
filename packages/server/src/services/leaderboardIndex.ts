import { onStateSaved, scanStates } from './gameStore.js';

/**
 * Leaderboard index.
 *
 * The previous implementation read *every* save file synchronously on *every*
 * request (`readdirSync` + `readFileSync` in the route handler) — at a few
 * thousand players that blocks the event loop for the whole board.
 *
 * Now there is one in-memory index:
 *   - filled by a single async scan, refreshed at most once per TTL;
 *   - updated in place whenever a state is saved (no scan needed for the
 *     player who is actually playing);
 *   - served with limit/offset, plus the caller's own rank even when they are
 *     outside the visible page.
 */

export interface LeaderboardRow {
  userId: string;
  name: string;
  grade: string;
  rating: number;
  day: number;
  /** career ending, if the run is finished */
  ending?: string | null;
  /** true when the player never bought a booster item (honest board) */
  honest: boolean;
  updatedAt: number;
}

export interface LeaderboardPage {
  rows: Array<LeaderboardRow & { rank: number; isYou: boolean }>;
  total: number;
  you: (LeaderboardRow & { rank: number; isYou: true }) | null;
  updatedAt: number;
}

const TTL_MS = Number(process.env.LEADERBOARD_TTL_MS ?? 15_000);

const index = new Map<string, LeaderboardRow>();
let lastScanAt = 0;
let scanning: Promise<void> | null = null;

/** Items that buy raw progress — owning any of them takes you off the honest board. */
const BOOSTER_ITEMS = new Set(['energy_drink', 'nootropics', 'coffee_machine_pro']);

export function rowFromState(userId: string, state: any): LeaderboardRow | null {
  if (!state || typeof state.currentDay !== 'number') return null;
  const items: string[] = Array.isArray(state.items) ? state.items : [];
  return {
    userId,
    name: state.firstName ?? `Игрок ${state.telegramId ?? userId}`,
    grade: state.grade ?? 'unemployed',
    rating: Math.round(state.ratingScore ?? 0),
    day: state.currentDay ?? 1,
    ending: state.careerEnding ?? null,
    honest: !items.some((id) => BOOSTER_ITEMS.has(id)),
    updatedAt: state.lastTickAt ?? Date.now(),
  };
}

/** Keep the index warm on every write instead of re-scanning the directory. */
onStateSaved((userId, state) => {
  const row = rowFromState(userId, state);
  if (row) index.set(userId, row);
});

async function refresh(force = false): Promise<void> {
  const fresh = Date.now() - lastScanAt < TTL_MS;
  if (!force && fresh && index.size) return;
  if (scanning) return scanning;

  scanning = (async () => {
    const states = await scanStates();
    index.clear();
    for (const { userId, state } of states) {
      const row = rowFromState(userId, state);
      if (row) index.set(userId, row);
    }
    lastScanAt = Date.now();
  })().finally(() => {
    scanning = null;
  });

  return scanning;
}

export interface LeaderboardQuery {
  limit?: number;
  offset?: number;
  userId?: string | null;
  /** only players without booster items */
  honestOnly?: boolean;
}

export async function getLeaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardPage> {
  await refresh();

  const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
  const offset = Math.max(0, query.offset ?? 0);

  let all = [...index.values()];
  if (query.honestOnly) all = all.filter((r) => r.honest);
  all.sort((a, b) => b.rating - a.rating || b.day - a.day || a.userId.localeCompare(b.userId));

  const ranked = all.map((row, i) => ({ ...row, rank: i + 1, isYou: row.userId === query.userId }));
  const page = ranked.slice(offset, offset + limit);

  const you = query.userId ? ranked.find((r) => r.userId === query.userId) ?? null : null;

  return {
    rows: page,
    total: ranked.length,
    you: you ? ({ ...you, isYou: true } as LeaderboardPage['you']) : null,
    updatedAt: lastScanAt,
  };
}

/** Test helper: drop the index and force the next read to re-scan. */
export function resetLeaderboardIndex(): void {
  index.clear();
  lastScanAt = 0;
}
