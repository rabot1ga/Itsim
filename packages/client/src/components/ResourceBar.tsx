import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * The HUD.
 *
 * In an idle game the top bar is not decoration — it is the scoreboard the
 * player checks after every single tap. So it follows the genre's rules:
 * one number is the hero (money), the numbers never move on the screen, they
 * are abbreviated once they get long, and each one gives a chunky bounce the
 * moment it changes (the floating +N labels come from GainStream).
 *
 * What is NOT here is as deliberate as what is. Reputation and the leaderboard
 * rating only matter in their own context, so they live there (career gate
 * card, «Топ», achievements), not in a bar that would shout about two gold
 * stars all day. The persistent row shows only what the player spends right
 * now: energy (action currency), health and motivation — the three vitals that
 * gate a decision this very tap.
 */

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

/** True for one animation frame after `value` changes — used to bounce a counter. */
function usePop(value: number): boolean {
  const [pop, setPop] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setPop(true);
    const t = setTimeout(() => setPop(false), 240);
    return () => clearTimeout(t);
  }, [value]);

  return pop;
}

const Meter: React.FC<{
  icon: string;
  label: string;
  value: number;
  max: number;
  color: string;
}> = ({ icon, label, value, max, color }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = pct < 25;
  const pop = usePop(Math.round(value));

  return (
    <div className="flex-1 min-w-0" title={`${label}: ${Math.round(value)}/${max}`}>
      <div className="flex items-center gap-1 mb-1">
        <PixelIcon name={icon} size={11} className={low ? 'text-clay-400' : 'text-ink-400'} title={label} />
        <span
          className={`num text-xs font-bold leading-none ${low ? 'text-clay-300' : 'text-ink-100'} ${
            pop ? 'num-pop' : ''
          }`}
        >
          {Math.round(value)}
        </span>
      </div>
      <div className="meter">
        <span className={low ? 'animate-pulse-soft' : ''} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};

export const ResourceBar: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const money = player?.money ?? 0;
  const moneyPop = usePop(money);

  if (!player) return null;

  const grade = GRADE_LABEL[player.grade] ?? player.grade;
  const gilded = GRADE_GOLD.has(player.grade);

  return (
    <header className="shrink-0 bg-ink-900 border-b-2 border-ink-700 px-3 pt-2 pb-2.5 space-y-2 safe-area-pt">
      <div className="flex items-center justify-between gap-2">
        {/* The scoreboard: the day is context, money is the number the loop
            is scored on — so it is the largest thing in the bar. */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="well flex items-baseline gap-1 px-1.5 py-1" title={`День ${player.currentDay ?? 1}`}>
            <span className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-500">Дн.</span>
            <span className="num text-xs font-bold text-ink-200 leading-none">{player.currentDay ?? 1}</span>
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            <PixelIcon name="coin" size={13} className="text-gold-300 shrink-0" />
            <span className={`num text-lg font-bold text-white leading-none truncate ${moneyPop ? 'num-pop' : ''}`}>
              {formatMoney(money)}
            </span>
          </span>
        </div>

        {/* Grade — identity, not a resource; never louder than money. */}
        <span className={`chip uppercase tracking-[0.06em] shrink-0 ${gilded ? 'text-gold-300' : 'text-ink-300'}`}>
          {grade}
        </span>
      </div>

      {/* Vitals the player spends this tap: energy gates actions, health and
          motivation gate burnout. Reputation/rating live where they matter. */}
      <div className="flex items-end gap-2.5">
        <Meter icon="bolt" label="Энергия" value={player.energy} max={player.maxEnergy || 16} color="var(--sky)" />
        <Meter icon="heart" label="Здоровье" value={player.health} max={100} color="var(--moss)" />
        <Meter icon="flame" label="Мотивация" value={player.motivation} max={100} color="var(--ochre)" />
      </div>
    </header>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} млн ₽`;
  if (amount >= 10_000) return `${Math.round(amount / 1000)} тыс ₽`;
  return `${amount.toLocaleString('ru-RU')} ₽`;
}
