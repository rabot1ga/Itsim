import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';

const GRADE_LABEL: Record<string, string> = {
  unemployed: 'без работы',
  intern: 'стажёр',
  junior: 'junior',
  middle: 'middle',
  senior: 'senior',
  teamlead: 'teamlead',
  architect: 'архитектор',
  cto: 'CTO',
};

/** Only the top of the ladder is gilded — everything else stays quiet on purpose. */
const GRADE_GOLD = new Set(['architect', 'cto']);

const Meter: React.FC<{
  icon: string;
  label: string;
  value: number;
  max: number;
  color: string;
}> = ({ icon, label, value, max, color }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = pct < 25;

  return (
    <div className="flex-1 min-w-0" title={`${label}: ${Math.round(value)}/${max}`}>
      <div className="flex items-center gap-1 mb-1">
        <PixelIcon
          name={icon}
          size={11}
          className={low ? 'text-clay-400' : 'text-ink-400'}
          title={label}
        />
        <span
          className={`num text-xs font-semibold leading-none ${
            low ? 'text-clay-300' : 'text-ink-200'
          }`}
        >
          {Math.round(value)}
        </span>
      </div>
      <div className="meter">
        <span
          className={low ? 'animate-pulse-soft' : ''}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
};

export const ResourceBar: React.FC = () => {
  const player = useGameStore((s) => s.player);

  if (!player) return null;

  const grade = GRADE_LABEL[player.grade] ?? player.grade;
  const gilded = GRADE_GOLD.has(player.grade);

  return (
    <header className="shrink-0 bg-ink-900 border-b border-ink-700 px-3 pt-2 pb-2.5 space-y-2 safe-area-pt">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
            День
          </span>
          <span className="num text-base font-semibold text-white leading-none">
            {player.currentDay ?? 1}
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {player.ratingScore !== undefined && (
            <span className="chip" title="Рейтинг для лидерборда">
              <PixelIcon name="star" size={10} className="text-gold-300" />
              <span className="num">{player.ratingScore}</span>
            </span>
          )}
          <span
            className={`chip uppercase tracking-[0.06em] ${
              gilded ? 'text-gold-300 border-gold-700' : 'text-ink-200'
            }`}
          >
            {grade}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-2.5">
        <Meter
          icon="bolt"
          label="Энергия"
          value={player.energy}
          max={player.maxEnergy || 16}
          color="var(--sky)"
        />
        <Meter icon="heart" label="Здоровье" value={player.health} max={100} color="var(--moss)" />
        <Meter
          icon="flame"
          label="Мотивация"
          value={player.motivation}
          max={100}
          color="var(--ochre)"
        />
        <Meter
          icon="star"
          label="Репутация"
          value={player.reputation}
          max={100}
          color="var(--gold)"
        />

        <div className="text-right shrink-0 pl-1">
          <div className="text-2xs uppercase tracking-[0.09em] text-ink-500 leading-none mb-1">
            Баланс
          </div>
          <div className="num text-sm font-semibold text-white leading-none">
            {formatMoney(player.money ?? 0)}
          </div>
        </div>
      </div>
    </header>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} млн ₽`;
  if (amount >= 10_000) return `${Math.round(amount / 1000)} тыс ₽`;
  return `${amount.toLocaleString('ru-RU')} ₽`;
}
