import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { Spinner, EmptyState, SpriteBadge } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';

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

/** Top three get a gilded rank plate; everybody else gets a quiet number. */
const RANK_TONE = ['text-gold-300 border-gold-700', 'text-ink-100 border-ink-600', 'text-wood-300 border-wood-700'];

const Row: React.FC<{ row: LeaderRow }> = ({ row }) => (
  <div
    className={`panel !py-2.5 !px-3 flex items-center gap-3 ${
      row.isYou ? 'panel-note panel-note-gold' : ''
    }`}
  >
    <span
      className={`num w-7 h-7 shrink-0 grid place-items-center border text-xs font-semibold ${
        RANK_TONE[row.rank - 1] ?? 'text-ink-500 border-ink-700'
      }`}
    >
      {row.rank}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={`text-sm font-medium truncate ${row.isYou ? 'text-gold-300' : 'text-ink-100'}`}
        >
          {row.name}
        </span>
        {row.isYou && <span className="text-2xs text-ink-500 shrink-0">ты</span>}
      </div>
      <span className="text-2xs text-ink-500">
        {GRADE_LABELS[row.grade] ?? row.grade} · <span className="num">день {row.day}</span>
      </span>
    </div>
    <span className="num text-sm font-semibold text-white shrink-0">{row.rating}</span>
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <SpriteBadge sprite="presentation_board" size={32} />
          Лидерборд
        </h2>
        {player?.ratingScore !== undefined && (
          <span className="chip">
            <PixelIcon name="star" size={10} className="text-gold-300" />
            <span className="num">{player.ratingScore}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-ink-500 -mt-2 leading-relaxed">
        Рейтинг считается по карьере, навыкам, деньгам, репутации, ачивкам и жилью
      </p>

      <div className="flex gap-1.5">
        {[
          { id: false, label: 'Все' },
          { id: true, label: 'Без бустеров' },
        ].map((tab) => (
          <button
            key={String(tab.id)}
            onClick={() => setHonestOnly(tab.id)}
            className={`chip touch-target !px-3 ${
              honestOnly === tab.id
                ? '!bg-ink-700 !text-white !border-ink-600'
                : '!text-ink-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {total > 0 && (
          <span className="chip !bg-transparent !border-transparent !text-ink-600 ml-auto">
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
          <EmptyState
            icon="chart"
            title="Пока пусто"
            hint="Сыграй первый день — и попадёшь в топ."
          />
        )}
      </div>
    </div>
  );
};
