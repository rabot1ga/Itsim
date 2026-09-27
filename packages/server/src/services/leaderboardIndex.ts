import { RATING_METRICS, ratingParts, type RatingComponent, type RatingInput, type RatingMetric } from '@itsim/shared';
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
  /**
   * Компоненты рейтинга (0..100) ровно из `@itsim/shared` — по ним сортируют
   * метрические вкладки доски. Хранятся не округлёнными: округление до целого
   * превращает «Деньги» в доску ничьих (log-шкала), а порядок должен быть
   * честным.
   */
  parts: Record<RatingComponent, number>;
  day: number;
  /** career ending, if the run is finished */
  ending?: string | null;
  /** true when the player never bought a booster item (honest board) */
  honest: boolean;
  updatedAt: number;
}

export interface RankedRow extends LeaderboardRow {
  rank: number;
  isYou: boolean;
  /** значение метрики, по которой доска отсортирована (0..100 или 0..1000) */
  score: number;
}

export interface LeaderboardPage {
  rows: RankedRow[];
  total: number;
  you: (RankedRow & { isYou: true }) | null;
  /** что за метрика — клиент сверяет с ней подпись и единицу измерения */
  metric: RatingMetric;
  updatedAt: number;
}

const TTL_MS = Number(process.env.LEADERBOARD_TTL_MS ?? 15_000);

const index = new Map<string, LeaderboardRow>();
let lastScanAt = 0;
let scanning: Promise<void> | null = null;

/** Items that buy raw progress — owning any of them takes you off the honest board. */
const BOOSTER_ITEMS = new Set(['energy_drink', 'nootropics', 'coffee_machine_pro']);

/**
 * `scanStates` отдаёт сырой JSON без `migrateState` (gameStore.ts:155-157), так
 * что до поля состояния нельзя дотрагиваться напрямую: пропущенный массив
 * превратил бы сумму навыков в NaN, а NaN в компараторе — это произвольный
 * (и неустойчивый) порядок на доске.
 */
function ratingInputOf(state: any): RatingInput {
  const housing = Math.min(4, Math.max(0, Math.trunc(Number(state.housingLevel) || 0)));
  return {
    grade: state.grade ?? 'unemployed',
    skills: state.skills && typeof state.skills === 'object' ? state.skills : {},
    money: Number(state.money) || 0,
    reputation: Number(state.reputation) || 0,
    achievements: Array.isArray(state.achievements) ? state.achievements : [],
    // HousingLevel — литеральный союз 0|1|2|3|4, поэтому не `Number(...)`, а
    // зажатый в шкалу целый номер: сейв с `housingLevel: 9` не должен
    // перевестись в «бесконечное жильё».
    housingLevel: housing as RatingInput['housingLevel'],
  };
}

export function rowFromState(userId: string, state: any): LeaderboardRow | null {
  if (!state || typeof state.currentDay !== 'number') return null;
  const items: string[] = Array.isArray(state.items) ? state.items : [];
  return {
    userId,
    parts: ratingParts(ratingInputOf(state)),
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
  /** по чему считать место; по умолчанию — итоговый рейтинг */
  metric?: RatingMetric;
}

/** Метрика из запроса: строка приходит из URL, и неизвестную надо отклонить, а
 *  не молча пересортировать на «рейтинг» — иначе клиент получает одну доску,
 *  а подпись на экране рисует другую. */
export function isRatingMetric(value: unknown): value is RatingMetric {
  return typeof value === 'string' && (RATING_METRICS as readonly string[]).includes(value);
}

export async function getLeaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardPage> {
  await refresh();

  const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
  const offset = Math.max(0, query.offset ?? 0);
  const metric: RatingMetric = query.metric ?? 'rating';
  const value = (row: LeaderboardRow) => (metric === 'rating' ? row.rating : row.parts[metric]);

  let all = [...index.values()];
  if (query.honestOnly) all = all.filter((r) => r.honest);
  // Ничья по метрике разрешается по дню и только потом по id — порядок должен
  // быть одинаковым на любой странице, иначе строка «прыгает» между запросами.
  all.sort((a, b) => value(b) - value(a) || b.day - a.day || a.userId.localeCompare(b.userId));

  const ranked: RankedRow[] = all.map((row, i) => ({
    ...row,
    rank: i + 1,
    isYou: row.userId === query.userId,
    score: value(row),
  }));
  const page = ranked.slice(offset, offset + limit);

  const you = query.userId ? (ranked.find((r) => r.userId === query.userId) ?? null) : null;

  return {
    rows: page,
    total: ranked.length,
    you: you ? ({ ...you, isYou: true } as RankedRow & { isYou: true }) : null,
    metric,
    updatedAt: lastScanAt,
  };
}

/** Test helper: drop the index and force the next read to re-scan. */
export function resetLeaderboardIndex(): void {
  index.clear();
  lastScanAt = 0;
}
