import React from 'react';
import { useGameStore } from '../store/gameStore';

const ResourceItem: React.FC<{
  icon: string;
  label: string;
  value: number;
  max: number;
  color: string;
}> = ({ icon, label, value, max, color }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColor = pct < 25 ? 'bg-red-500' : pct < 50 ? color : color;

  return (
    <div className="flex items-center gap-2 min-w-0" title={`${label}: ${Math.round(value)}/${max}`}>
      <span className="text-sm flex-shrink-0">{icon}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden min-w-[40px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right flex-shrink-0 tabular-nums">
        {Math.round(value)}
      </span>
    </div>
  );
};

export const ResourceBar: React.FC = () => {
  const player = useGameStore((s) => s.player);

  if (!player) return null;

  return (
    <div className="bg-slate-900/95 border-b border-slate-700 px-3 py-2 space-y-1.5">
      {/* Day & Grade */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span>День {player.currentDay ?? 1}</span>
        <span className="px-2 py-0.5 bg-slate-700 rounded-full text-primary-300 font-medium">
          {player.grade === 'unemployed' ? 'Без работы' : player.grade}
        </span>
      </div>

      {/* Resources */}
      <ResourceItem icon="⚡" label="Энергия" value={player.energy} max={player.maxEnergy || 16} color="bg-indigo-500" />
      <ResourceItem icon="❤️" label="Здоровье" value={player.health} max={100} color="bg-green-500" />
      <ResourceItem icon="🔥" label="Мотивация" value={player.motivation} max={100} color="bg-amber-500" />
      <ResourceItem icon="⭐" label="Репутация" value={player.reputation} max={100} color="bg-purple-500" />

      {/* Money */}
      <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-700">
        <span className="text-slate-400">💰 Деньги</span>
        <span className="text-emerald-400 font-mono font-bold">{formatMoney(player.money ?? 0)}</span>
      </div>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс`;
  return `${amount}`;
}