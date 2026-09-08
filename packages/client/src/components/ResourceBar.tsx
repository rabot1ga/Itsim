import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { xpToNext } from '@itsim/shared';
import { PlayerPortrait } from './PlayerPortrait';
import { StatBar } from './ui';

/**
 * Top chrome: title bar with the «⋮» menu, a currency strip, and — on the home
 * screen — the HUD from the reference: portrait + level + XP, then the three
 * vitals (energy / mood / health), each in its own fixed colour.
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

const SKILL_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  react: 'React',
  sql: 'SQL',
  nodejs: 'Node.js',
  git: 'Git',
  docker: 'Docker',
  linux: 'Linux',
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
  const coins = Math.round(player.meta?.coins ?? player.metaCoins ?? 0);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <button className="topbar-btn" aria-label="На главную" onClick={() => setView('main')}>
          ‹
        </button>
        <div className="topbar-title">
          IT Life<span>mini app</span>
        </div>
        <button
          className="topbar-btn"
          aria-label="Меню"
          aria-expanded={Boolean(moreOpen)}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          ⋮
        </button>
      </div>

      <div className="wallet-strip">
        <span className={`wallet-pill num ${moneyPop ? 'num-pop' : ''}`} aria-label="Деньги">
          <span aria-hidden="true">💰</span>
          {Math.round(player.money ?? 0).toLocaleString('ru-RU')} ₽
        </span>
        {coins > 0 && (
          <span className="wallet-pill is-gold num" aria-label="Монеты">
            <span aria-hidden="true">🪙</span>
            {coins.toLocaleString('ru-RU')}
          </span>
        )}
        <span className="wallet-spacer" />
        {!home && (
          <span className="wallet-pill is-dim num" aria-label="Энергия">
            <span aria-hidden="true">⚡</span>
            {Math.round(player.energy ?? 0)} / {player.maxEnergy ?? 10}
          </span>
        )}
        <span className="wallet-pill is-dim num">День {player.currentDay ?? 1}</span>
      </div>

      {home && (
        <div className="hud">
          <section className="hud-identity" aria-label="Персонаж и основной навык">
            <button className="hud-portrait" aria-label="Открыть профиль" onClick={() => setView('profile')}>
              <PlayerPortrait player={player} size={56} />
            </button>
            <div className="hud-identity-copy">
              <div className="hud-level-row">
                <span className="hud-level">
                  lvl {skill.level}
                  <small>{SKILL_NAMES[id] ?? id}</small>
                </span>
                <span className="hud-day">{GRADE_LABEL[player.grade] ?? player.grade}</span>
              </div>
              <div
                className="hud-xp"
                role="progressbar"
                aria-label="Опыт основного навыка"
                aria-valuemin={0}
                aria-valuemax={maxed ? 100 : need}
                aria-valuenow={maxed ? 100 : Math.min(need, skill.xp)}
              >
                <i style={{ width: `${pct}%` }} />
                <b className="num">{maxed ? 'Максимум' : `${skill.xp} / ${need} XP`}</b>
              </div>
            </div>
          </section>

          <div className="hud-vitals">
            <StatBar resource="energy" value={player.energy} max={player.maxEnergy || 10} />
            <StatBar resource="mood" value={player.motivation} max={100} />
            <StatBar resource="health" value={player.health} max={100} />
          </div>
        </div>
      )}
    </header>
  );
};
