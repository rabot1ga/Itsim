import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { xpToNext } from '@itsim/shared';
import { PlayerPortrait } from './PlayerPortrait';
import { StatBar } from './ui';

/**
 * Top chrome — deliberately shallow so the screen below gets the pixels.
 *
 * On «Главной» there is exactly one plaque: the money, the day and the «⋮»
 * menu moved inside the HUD card, next to the portrait, level, XP and vitals.
 * Two stacked strips ate ~140px before the first real card; the merged one
 * costs ~90px and still says the same things. Other screens keep the plain
 * strip — there the back arrow and the energy pill are the whole HUD.
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
    <header className={`topbar ${home ? 'is-home' : ''}`}>
      {!home && (
        <div className="topbar-row">
          <button className="topbar-btn" aria-label="На главную" onClick={() => setView('main')}>
            ‹
          </button>
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
          <span
            className="wallet-pill is-dim num"
            aria-label="Энергия"
            title={`Энергия: ${Math.round(player.energy ?? 0)}/${player.maxEnergy ?? 10}`}
          >
            <span aria-hidden="true">⚡</span>
            {Math.round(player.energy ?? 0)} / {player.maxEnergy ?? 10}
          </span>
          <span className="wallet-pill is-dim num">День {player.currentDay ?? 1}</span>
          <button
            className="topbar-btn"
            aria-label="Меню"
            aria-expanded={Boolean(moreOpen)}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            ⋮
          </button>
        </div>
      )}

      {home && (
        <section className="hud" aria-label="Персонаж и состояние">
          <button className="hud-portrait" aria-label="Открыть профиль" onClick={() => setView('profile')}>
            <PlayerPortrait player={player} size={56} />
          </button>
          <div className="hud-identity-copy">
            <div className="hud-level-row">
              <span className="hud-level">
                lvl {skill.level}
                <small>{GRADE_LABEL[player.grade] ?? player.grade}</small>
              </span>
              <span className="wallet-spacer" />
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
              <span className="wallet-pill is-dim num">День {player.currentDay ?? 1}</span>
              <button
                className="topbar-btn hud-menu"
                aria-label="Меню"
                aria-expanded={Boolean(moreOpen)}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                ⋮
              </button>
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
              <b className="num">
                {SKILL_NAMES[id] ?? id} · {maxed ? 'Максимум' : `${skill.xp} / ${need} XP`}
              </b>
            </div>
            <div className="hud-vitals">
              <StatBar compact resource="energy" value={player.energy} max={player.maxEnergy || 10} />
              <StatBar compact resource="mood" value={player.motivation} max={100} />
              <StatBar compact resource="health" value={player.health} max={100} />
            </div>
          </div>
        </section>
      )}
    </header>
  );
};
