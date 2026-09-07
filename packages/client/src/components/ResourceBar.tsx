import React from 'react';
import { useGameStore } from '../store/gameStore';

const GRADE_META: Record<string, { label: string; cls: string }> = {
  unemployed: { label: 'Без работы', cls: 'bg-slate-700/80 text-slate-300' },
  intern: { label: 'Стажёр', cls: 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50' },
  junior: { label: 'Junior', cls: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50' },
  middle: { label: 'Middle', cls: 'bg-sky-900/60 text-sky-300 border border-sky-700/50' },
  senior: { label: 'Senior', cls: 'bg-violet-900/60 text-violet-300 border border-violet-700/50' },
  teamlead: { label: 'Teamlead', cls: 'bg-amber-900/60 text-amber-300 border border-amber-700/50' },
  architect: { label: 'Архитектор', cls: 'bg-fuchsia-900/60 text-fuchsia-300 border border-fuchsia-700/50' },
  cto: { label: 'CTO', cls: 'bg-rose-900/60 text-rose-300 border border-rose-700/50' },
};

const ResourceChip: React.FC<{
  icon: string;
  value: number;
  max: number;
  color: string;
  lowPulse?: boolean;
}> = ({ icon, value, max, color, lowPulse }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = pct < 25;

  return (
    <div className="flex-1 min-w-0 rounded-lg bg-slate-800/60 border border-slate-700/40 px-2 py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] leading-none">{icon}</span>
        <span className={`text-[10px] font-semibold tabular-nums leading-none ${low ? 'text-red-400' : 'text-slate-300'}`}>
          {Math.round(value)}
        </span>
      </div>
      <div className="h-1 bg-slate-700/70 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color} ${lowPulse && low ? 'animate-pulse-soft' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const ResourceBar: React.FC = () => {
  const player = useGameStore((s) => s.player);

  if (!player) return null;

  const gradeMeta = GRADE_META[player.grade] ?? GRADE_META.unemployed;

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700/70 px-3 pt-2 pb-2 space-y-2 safe-area-pt shrink-0">
      {/* Day, grade, rating */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
          📅 День {player.currentDay ?? 1}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          {player.ratingScore !== undefined && (
            <span className="chip bg-slate-800 text-amber-300 border border-slate-700" title="Рейтинг для лидерборда">
              🏆 {player.ratingScore}
            </span>
          )}
          <span className={`chip ${gradeMeta.cls}`}>{gradeMeta.label}</span>
        </div>
      </div>

      {/* Resource chips */}
      <div className="flex gap-1.5">
        <ResourceChip icon="⚡" value={player.energy} max={player.maxEnergy || 16} color="bg-indigo-500" lowPulse />
        <ResourceChip icon="❤️" value={player.health} max={100} color="bg-emerald-500" lowPulse />
        <ResourceChip icon="🔥" value={player.motivation} max={100} color="bg-amber-500" lowPulse />
        <ResourceChip icon="⭐" value={player.reputation} max={100} color="bg-violet-500" />
        <div className="flex-1 min-w-0 rounded-lg bg-emerald-950/40 border border-emerald-700/40 px-1.5 py-1 flex items-center justify-center">
          <span className="text-[11px] font-bold text-emerald-300 tabular-nums whitespace-nowrap">
            💰 {formatMoney(player.money ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}
