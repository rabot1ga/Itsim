import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';
import { SectionTitle } from './ui';
import { haptic } from '../lib/telegram';
import { playSfx } from '../lib/sfx';
import { STYLES, STYLE_PERKS, winOdds, type Fighter } from '@itsim/shared';

/**
 * «Бой» (DESIGN-PUNCH §3): уличные бои со ставками и деревья стилей.
 * НЕ .story-card — e2e-контракт story-колоды не трогаем; это своя карточка.
 *
 * Поток: «Найти боя» (preview_fight → pendingFight в сейве) → экран
 * соперника с шансами и ставкой → «Драться» (street_fight) → лог раундов.
 */

const STAKE_OPTIONS = [0, 500, 2000, 5000];

export const FightCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [stake, setStake] = useState(0);
  if (!player) return null;

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

  const me: Fighter = {
    name: 'Ты',
    power: player.combat?.power?.level ?? 5,
    agility: player.combat?.agility?.level ?? 5,
    speed: player.combat?.speed?.level ?? 5,
    style: (player.style ?? 'bear') as Fighter['style'],
    perks: player.stylePerks ?? [],
  };
  const pending = player.pendingFight;
  const last = player.lastFight;

  return (
    <section className="card space-y-2">
      <SectionTitle>{t('Уличные бои')}</SectionTitle>

      {/* Стиль */}
      <div className="flex gap-1.5">
        {(Object.keys(STYLES) as Array<keyof typeof STYLES>).map((id) => (
          <button
            key={id}
            className={`btn text-xs flex-1 ${player.style === id ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={player.style === id}
            disabled={busy !== null}
            onClick={() => void act('choose_style', { style: id }, `style-${id}`)}
          >
            {t(STYLES[id].label)}
          </button>
        ))}
      </div>

      {/* Перки стиля */}
      <ul className="space-y-1">
        {Object.entries(STYLE_PERKS).map(([id, perk]) => {
          const owned = (player.stylePerks ?? []).includes(id);
          const level = me[perk.stat];
          const locked = level < perk.need;
          return (
            <li key={id} className="flex items-center justify-between gap-2 text-xs">
              <span className={owned ? 'text-moss-300' : locked ? 'text-ink-600' : 'text-ink-200'}>
                <PixelIcon name={owned ? 'check' : 'target'} size={11} /> {t(perk.label)}
              </span>
              {owned ? (
                <span className="text-2xs text-ink-500">{t('открыт')}</span>
              ) : (
                <button
                  className="btn btn-ghost text-2xs"
                  disabled={busy !== null || locked}
                  onClick={() => void act('buy_style_perk', { perk: id }, `perk-${id}`)}
                >
                  {locked ? t('нужен {p0} {p1}+', { p0: perk.stat, p1: perk.need }) : `${perk.cost} ₽`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Поиск соперника / превью / результат */}
      {!pending && !player.fightDoneToday && (
        <button
          className="btn btn-primary w-full text-sm"
          disabled={busy !== null}
          onClick={() => void act('preview_fight', {}, 'preview')}
        >
          {t('Найти соперника')}
        </button>
      )}
      {player.fightDoneToday && !pending && (
        <p className="text-2xs text-ink-500">{t('На сегодня бой окончен — завтра новый.')}</p>
      )}

      {pending && (
        <div className="rounded-xl border border-ink-700 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm text-ink-100">
              <PixelIcon name="person" size={14} />
              {t('Соперник: {p0}', { p0: pending.name })}
            </span>
            <span className="num text-xs text-gold-300">
              {t('шансы {p0}%', { p0: winOdds(me, pending as Fighter) })}
            </span>
          </div>
          <div className="num text-2xs text-ink-400">
            {t('сила {p0} · ловкость {p1} · скорость {p2}', {
              p0: pending.power,
              p1: pending.agility,
              p2: pending.speed,
            })}{' '}
            · {t('стиль: {p0}', { p0: t(STYLES[pending.style as keyof typeof STYLES]?.label ?? pending.style) })}
          </div>
          <div className="flex gap-1.5">
            {STAKE_OPTIONS.map((s) => (
              <button
                key={s}
                className={`btn text-2xs flex-1 ${stake === s ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={stake === s}
                onClick={() => setStake(s)}
              >
                {s === 0 ? t('без ставки') : `${s} ₽`}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              className="btn btn-secondary text-xs flex-1"
              disabled={busy !== null}
              onClick={() => void act('choose_style', { style: player.style }, 'noop')}
            >
              {t('Отступить')}
            </button>
            <button
              className="btn btn-primary text-xs flex-1"
              disabled={busy !== null}
              onClick={() => void act('street_fight', { stake }, 'fight')}
            >
              {t('Драться!')}
            </button>
          </div>
        </div>
      )}

      {/* Лог последнего боя */}
      {last && (
        <details className="text-2xs text-ink-300">
          <summary>
            {last.won ? t('Победа') : t('Поражение')} · {last.opponent} · {t('раундов: {p0}', { p0: last.log.length })}
          </summary>
          <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
            {last.log.slice(0, 30).map((r: any, i: number) => (
              <li key={i} className="num">
                #{r.round} {r.attacker === 'a' ? '→' : '←'}{' '}
                {r.kind === 'dodge'
                  ? t('уклонение')
                  : r.kind === 'crit'
                    ? t('крит! −{p0}', { p0: r.damage })
                    : t('удар −{p0}', { p0: r.damage })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
