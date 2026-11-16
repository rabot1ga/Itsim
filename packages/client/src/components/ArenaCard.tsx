import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';
import { SectionTitle } from './ui';
import { haptic } from '../lib/telegram';
import { playSfx } from '../lib/sfx';
import { SEASON_FIGHTS, ensureLeague, divisionOf } from '@itsim/shared';

/**
 * Лиги и турниры (DESIGN-PUNCH §5/§6): «Боевой вечер» лиги, IT-турнир и
 * корпоративный турнир. Не .story-card — e2e-контракт колоды не трогаем.
 */

export const ArenaCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [stake, setStake] = useState(0);
  if (!player) return null;

  const league = ensureLeague(player as never);
  const div = divisionOf(league.division);
  const gradeOk = ['senior', 'lead', 'cto'].includes(player.grade ?? '');

  const act = async (id: string, params: Record<string, unknown>, key: string) => {
    if (busy) return;
    haptic('selection');
    playSfx('tap');
    setBusy(key);
    try {
      await performAction(id, params);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card space-y-2">
      <SectionTitle>
        {t('Лиги и турниры')}
        <span className="ml-auto num text-2xs text-gold-300">{t('слава: {p0}', { p0: player.fame ?? 0 })}</span>
      </SectionTitle>

      {/* Лига */}
      <div className="rounded-xl border border-ink-700 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-ink-100">
            <PixelIcon name="target" size={14} />
            {t(div.label)}
            {league.champion ? ` · ${t('чемпион')}` : ''}
          </span>
          <span className="num text-xs text-gold-300">
            {t('очки {p0} · матч {p1}/{p2}', { p0: league.points, p1: league.slot, p2: SEASON_FIGHTS })}
          </span>
        </div>
        <div className="flex gap-1.5">
          {[0, 500, 2000, 5000].map((s) => (
            <button
              key={s}
              className={`btn text-2xs flex-1 min-w-0 px-1 ${stake === s ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={stake === s}
              onClick={() => setStake(s)}
            >
              {s === 0 ? t('без ставки') : `${s} ₽`}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary w-full text-sm"
          disabled={busy !== null || !!player.leagueDoneToday}
          onClick={() => void act('league_fight', { stake }, 'league')}
        >
          {player.leagueDoneToday ? t('Матч дня сыгран') : t('Боевой вечер')}
        </button>
        <p className="text-2xs text-ink-500">
          {t('Сезон: 5 матчей, победа — 3 очка. {p0}+ очков — повышение.', { p0: div.need })}
        </p>
      </div>

      {/* IT-турнир */}
      <button
        className="btn btn-secondary w-full text-sm text-left"
        disabled={busy !== null || !!player.itTourneyDoneToday}
        onClick={() => void act('it_tourney', {}, 'it')}
      >
        <PixelIcon name="laptop" size={14} />{' '}
        {player.itTourneyDoneToday
          ? t('IT-турнир дня окончен')
          : t('IT-турнир (код-дуэли/CTF/хакатон) — взнос 2 000 ₽')}
      </button>

      {/* Корпоративный турнир */}
      <button
        className="btn btn-secondary w-full text-sm text-left"
        disabled={busy !== null || !!player.corpTourneyDoneToday || !gradeOk}
        onClick={() => void act('corp_tourney', {}, 'corp')}
      >
        <PixelIcon name="briefcase" size={14} />{' '}
        {!gradeOk
          ? t('Корпоративный турнир — с уровня senior')
          : player.corpTourneyDoneToday
            ? t('Корпоративный турнир дня окончен')
            : t('Корпоративный турнир')}
      </button>
    </section>
  );
};
