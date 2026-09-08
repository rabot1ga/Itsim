import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { Spinner, EmptyState, ScreenTitle } from '../components/ui';

/**
 * Leaderboard — real ratings from persisted player states.
 *
 * Two boards: global and «честный» (players who never bought booster items).
 * The server ranks by the authenticated user, so `isYou` is trustworthy, and
 * returns your own row separately when you are below the visible page.
 */

interface LeaderRow {
  rank: number;
  name: string;
  grade: string;
  rating: number;
  day: number;
  isYou: boolean;
  honest?: boolean;
  ending?: string | null;
}

const GRADE_LABELS: Record<string, string> = {
  unemployed: 'Без работы',
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

/** Podium medals; everybody else gets a quiet number. */
const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const Row: React.FC<{ row: LeaderRow }> = ({ row }) => (
  <div className={`lb-row ${row.isYou ? 'is-me' : ''}`}>
    <span className="lb-rank num" aria-hidden="true">
      {MEDAL[row.rank] ?? row.rank}
    </span>
    <div className="flex-1 min-w-0">
      <div className="lb-name">
        {row.name}
        {row.isYou && <span className="text-2xs text-ink-500"> · ты</span>}
      </div>
      <span className="lb-meta">
        {GRADE_LABELS[row.grade] ?? row.grade} · <span className="num">день {row.day}</span>
      </span>
    </div>
    <span className="lb-score num">{row.rating} ⭐</span>
  </div>
);

export const LeaderboardView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [you, setYou] = useState<LeaderRow | null>(null);
  const [total, setTotal] = useState(0);
  const [honestOnly, setHonestOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    apiRequest(`/leaderboard/${honestOnly ? 'honest' : 'friends'}?limit=20`)
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data.leaderboard ?? []);
        setYou(data.you ?? null);
        setTotal(data.total ?? 0);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [player?.telegramId, honestOnly]);

  const youOutsidePage = you && !rows.some((r) => r.isYou);

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle
        emoji="🏆"
        meta={player?.ratingScore !== undefined ? `твой рейтинг ${player.ratingScore} ⭐` : undefined}
      >
        Топ игроков
      </ScreenTitle>
      <p className="subtle -mt-2">Рейтинг считается по карьере, навыкам, деньгам, репутации, ачивкам и жилью.</p>

      <div className="segmented" role="group" aria-label="Фильтр рейтинга">
        {[
          { id: false, label: 'Все' },
          { id: true, label: 'Без бустеров' },
        ].map((tab) => (
          <button key={String(tab.id)} aria-pressed={honestOnly === tab.id} onClick={() => setHonestOnly(tab.id)}>
            {tab.label}
          </button>
        ))}
        {total > 0 && (
          <span className="chip ml-auto shrink-0">
            игроков: <span className="num">{total}</span>
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {!loaded && <Spinner label="Считаем рейтинг…" />}
        {rows.map((row) => (
          <Row key={row.rank} row={row} />
        ))}
        {youOutsidePage && (
          <>
            <div className="text-center text-ink-700 text-xs tracking-[0.3em]">···</div>
            <Row row={you!} />
          </>
        )}
        {loaded && rows.length === 0 && (
          <EmptyState emoji="📊" title="Пока пусто" hint="Сыграй первый день — и попадёшь в топ." />
        )}
      </div>
    </div>
  );
};
