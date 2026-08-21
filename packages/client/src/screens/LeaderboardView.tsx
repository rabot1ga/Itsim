import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Leaderboard — real ratings from persisted player states.
 */

interface LeaderRow {
  rank: number;
  name: string;
  grade: string;
  rating: number;
  day: number;
  isYou: boolean;
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

export const LeaderboardView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const userId = player?.telegramId ? `?userId=${encodeURIComponent(String(player.telegramId))}` : '';
    fetch(`/api/leaderboard/friends${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.leaderboard ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [player?.telegramId]);

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

      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.rank}
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
            <span className="text-sm font-bold text-amber-300 tabular-nums shrink-0">
              {row.rating}
            </span>
          </div>
        ))}
        {loaded && rows.length === 0 && (
          <div className="game-card text-center py-8">
            <div className="text-3xl mb-2">🏜</div>
            <p className="text-slate-400 text-sm">Пока пусто</p>
            <p className="text-slate-500 text-xs mt-1">Сыграй первый день — и попадёшь в топ!</p>
          </div>
        )}
      </div>
    </div>
  );
};
