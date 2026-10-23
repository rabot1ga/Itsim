import { t, fmtNumber } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { xpToNext } from '@itsim/shared';
import { profileArtwork, profileMoodOf } from '../lib/profileArt';
import { StatBar } from './ui';
import { skillName } from '../lib/playerLabels';
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
  unemployed: t('без работы'),
  intern: t('стажёр'),
  junior: 'junior',
  middle: 'middle',
  senior: 'senior',
  teamlead: 'teamlead',
  architect: t('архитектор'),
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
          <button className="topbar-btn" aria-label={t('На главную')} onClick={() => setView('main')}>
            ‹
          </button>
          <span className={`wallet-pill num ${moneyPop ? 'num-pop' : ''}`} aria-label={t('Деньги')}>
            <span aria-hidden="true">💰</span>
            {fmtNumber(Math.round(player.money ?? 0))} ₽
          </span>
          {coins > 0 && (
            <span className="wallet-pill is-gold num" aria-label={t('Монеты')}>
              <span aria-hidden="true">🪙</span>
              {fmtNumber(coins)}
            </span>
          )}
          <span className="wallet-spacer" />
          <span
            className="wallet-pill is-dim num"
            aria-label={t('Энергия')}
            title={t('Энергия: {p0}/{p1}', { p0: Math.round(player.energy ?? 0), p1: player.maxEnergy ?? 10 })}
          >
            <span aria-hidden="true">⚡</span>
            {Math.round(player.energy ?? 0)} / {player.maxEnergy ?? 10}
          </span>
          <span className="wallet-pill is-dim num">
            {t('День')} {player.currentDay ?? 1}
          </span>
          <button
            className="topbar-btn"
            aria-label={t('Меню')}
            aria-expanded={Boolean(moreOpen)}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            ⋮
          </button>
        </div>
      )}

      {home && (
        <section className="hud" aria-label={t('Персонаж и состояние')}>
          <button className="hud-portrait" aria-label={t('Открыть профиль')} onClick={() => setView('profile')}>
            <img className="hud-mood" src={profileArtwork(profileMoodOf(player))} alt="" />
          </button>
          <div className="hud-identity-copy">
            <div className="hud-level-row">
              <span className="hud-level">
                lvl {skill.level}
                <small>{GRADE_LABEL[player.grade] ?? player.grade}</small>
              </span>
              <span className="wallet-spacer" />
              <span className={`wallet-pill num ${moneyPop ? 'num-pop' : ''}`} aria-label={t('Деньги')}>
                <span aria-hidden="true">💰</span>
                {fmtNumber(Math.round(player.money ?? 0))} ₽
              </span>
              {coins > 0 && (
                <span className="wallet-pill is-gold num" aria-label={t('Монеты')}>
                  <span aria-hidden="true">🪙</span>
                  {fmtNumber(coins)}
                </span>
              )}
              <span className="wallet-pill is-dim num">
                {t('День')} {player.currentDay ?? 1}
              </span>
              <button
                className="topbar-btn hud-menu"
                aria-label={t('Меню')}
                aria-expanded={Boolean(moreOpen)}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                ⋮
              </button>
            </div>
            <div
              className="hud-xp"
              role="progressbar"
              aria-label={t('Опыт основного навыка')}
              aria-valuemin={0}
              aria-valuemax={maxed ? 100 : need}
              aria-valuenow={maxed ? 100 : Math.min(need, skill.xp)}
            >
              <i style={{ width: `${pct}%` }} />
              <b className="num">
                {skillName(id)} · {maxed ? t('Максимум') : `${skill.xp} / ${need} XP`}
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
