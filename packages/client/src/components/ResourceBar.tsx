import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { xpToNext } from '@itsim/shared';
import { PlayerPortrait } from './PlayerPortrait';
import { PixelIcon } from './pixel/PixelIcon';

/** Reference 1.png: home portrait/XP + three stacked vitals; compact wallet on other tabs.
 * The portrait follows the saved room look; numeric values come from player state.
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
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const pct = (safeValue / safeMax) * 100;
  const low = pct < 25;
  const pop = usePop(Math.round(value));

  return (
    <div className="vital-row flex-1 min-w-0" title={`${label}: ${Math.round(safeValue)}/${safeMax}`}>
      <div className="hud-meter-label">{label}</div>
      <div className="flex items-center gap-1 mb-1">
        <PixelIcon name={icon} size={11} className={low ? 'text-clay-400' : 'text-ink-400'} title={label} />
        <span
          className={`num text-xs font-bold leading-none ${low ? 'text-clay-300' : 'text-ink-100'} ${
            pop ? 'num-pop' : ''
          }`}
        >
          {Math.round(safeValue)}
          <span className="hud-meter-max"> / {safeMax}</span>
        </span>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
      >
        <span className={low ? 'animate-pulse-soft' : ''} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};

export const ResourceBar: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const currentView = useGameStore((s) => s.currentView);
  const setView = useGameStore((s) => s.setView);
  const setMoreOpen = useGameStore((s) => s.setMoreOpen);
  const moreOpen = useGameStore((s) => s.moreOpen);
  const moneyPop = usePop(player?.money ?? 0);
  if (!player) return null;
  const home = (!currentView || currentView === 'main') && !activeEvent;
  const id = player.mainSkillId || 'javascript';
  const skill = player.skills?.[id] ?? { level: 0, xp: 0 };
  const maxed = skill.level >= 100;
  const need = xpToNext(skill.level);
  const pct = maxed ? 100 : Math.max(0, Math.min(100, (skill.xp / need) * 100));
  const names: Record<string, string> = {
    javascript: 'JavaScript',
    python: 'Python',
    react: 'React',
    typescript: 'TypeScript',
    sql: 'SQL',
  };
  return (
    <header className={`reference-hud ${home ? 'reference-hud-home' : ''}`}>
      <div className="miniapp-chrome">
        <button aria-label="На главную" onClick={() => setView('main')}>
          <PixelIcon name="chevron" size={12} className="rotate-90" />
        </button>
        <div>
          IT Life<span>mini app</span>
        </div>
        <button aria-label="Ещё" aria-expanded={Boolean(moreOpen)} onClick={() => setMoreOpen(!moreOpen)}>
          <span aria-hidden="true">⋮</span>
        </button>
      </div>
      {home ? (
        <>
          <section className="reference-identity" aria-label="Персонаж и основной навык">
            <button className="profile-portrait-button" aria-label="Открыть профиль" onClick={() => setView('profile')}>
              <PlayerPortrait player={player} />
            </button>
            <div>
              <div className="reference-identity-meta">
                <span>
                  {names[id] ?? id} · ур. {skill.level}
                </span>
                <span className="num">День {player.currentDay ?? 1}</span>
              </div>
              <div
                className="reference-xp"
                role="progressbar"
                aria-label="Опыт основного навыка"
                aria-valuemin={0}
                aria-valuemax={maxed ? 100 : need}
                aria-valuenow={maxed ? 100 : Math.min(need, skill.xp)}
              >
                <span style={{ width: `${pct}%` }} />
                <b>{maxed ? 'Максимум' : `${skill.xp} / ${need} XP`}</b>
              </div>
              <span className="reference-identity-caption">
                {GRADE_LABEL[player.grade] ?? player.grade} · {player.money.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </section>
          <div className="reference-vitals">
            <Meter
              icon="bolt"
              label="Энергия"
              value={player.energy}
              max={player.maxEnergy || 16}
              color="var(--accent)"
            />
            <Meter icon="flame" label="Мотивация" value={player.motivation} max={100} color="var(--ochre)" />
            <Meter icon="heart" label="Здоровье" value={player.health} max={100} color="var(--clay)" />
          </div>
        </>
      ) : (
        <div className="reference-wallet">
          <span className={moneyPop ? 'num-pop' : ''}>
            <PixelIcon name="coin" size={16} />
            {player.money.toLocaleString('ru-RU')} ₽
          </span>
          <div className="wallet-energy" title={`Энергия: ${Math.round(player.energy)}/${player.maxEnergy}`}>
            <PixelIcon name="bolt" size={13} />
            {player.energy} / {player.maxEnergy}
          </div>
          <span>День {player.currentDay ?? 1}</span>
        </div>
      )}
    </header>
  );
};
