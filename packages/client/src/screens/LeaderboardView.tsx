import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { Spinner, EmptyState } from '../components/ui';

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

const MEDALS = ['🥇', '🥈', '🥉'];

const Row: React.FC<{ row: LeaderRow }> = ({ row }) => (
  <div
    className={`game-card !p-3 flex items-center gap-3 ${
      row.isYou ? 'border-amber-500/50 bg-amber-900/10' : ''
    }`}
  >
    <span className="w-8 text-center text-lg shrink-0">
      {row.rank <= 3 ? MEDALS[row.rank - 1] : <span className="text-slate-500 text-sm">{row.rank}</span>}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium truncate ${row.isYou ? 'text-amber-300' : 'text-slate-200'}`}>
          {row.name} {row.isYou && <span className="text-[10px] text-amber-400">(ты)</span>}
        </span>
      </div>
      <span className="text-[10px] text-slate-500">
        {GRADE_LABELS[row.grade] ?? row.grade} · день {row.day}
      </span>
    </div>
    <span className="text-sm font-bold text-amber-300 tabular-nums shrink-0">{row.rating}</span>
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">🏅 Лидерборд</h2>
        {player?.ratingScore !== undefined && (
          <span className="chip bg-slate-800 text-amber-300 border border-slate-700">
            🏆 ты: {player.ratingScore}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Рейтинг считается по карьере, навыкам, деньгам, репутации, ачивкам и жилью
      </p>

      <div className="flex gap-1.5">
        {[
          { id: false, label: '🌍 Все' },
          { id: true, label: '🤍 Честные' },
        ].map((tab) => (
          <button
            key={String(tab.id)}
            onClick={() => setHonestOnly(tab.id)}
            className={`chip border ${
              honestOnly === tab.id
                ? 'bg-sky-900/40 text-sky-200 border-sky-700'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {total > 0 && <span className="chip bg-slate-800 text-slate-500 border border-slate-700">игроков: {total}</span>}
      </div>

      <div className="space-y-1.5">
        {!loaded && <Spinner label="Считаем рейтинг…" />}
        {rows.map((row) => (
          <Row key={row.rank} row={row} />
        ))}
        {youOutsidePage && (
          <>
            <div className="text-center text-slate-600 text-xs">···</div>
            <Row row={you!} />
          </>
        )}
        {loaded && rows.length === 0 && (
          <EmptyState icon="🏜" title="Пока пусто" hint="Сыграй первый день — и попадёшь в топ!" />
        )}
      </div>
    </div>
  );
};
