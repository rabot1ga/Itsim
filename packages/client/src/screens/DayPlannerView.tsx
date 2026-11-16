import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { HomeRoomCard } from '../components/HomeRoomCard';
import { DeckView } from '../components/DeckView';
import { SectionTitle } from '../components/ui';
import { FightCard } from '../components/FightCard';
import { haptic } from '../lib/telegram';
import { playSfx } from '../lib/sfx';
import { SLOTS_PER_DAY, TRAINING, FOOD, REST, DEFAULT_HUNGER, type StatId } from '@itsim/shared';

/**
 * «День» (DESIGN-PUNCH §2/§6): планер времени вместо стека действий.
 * День = 5 слотов; еда/тренировка/отдых/работа — тратят слоты и нужды.
 * Над планером — «ежедневные карточки» (утро, крючки, память, соперник) в
 * режиме cards; сцена комнаты — контекст сверху (контракт layout.spec).
 */

const STATS: Array<{ id: StatId; icon: string; label: string }> = [
  { id: 'power', icon: 'bolt', label: 'Сила' },
  { id: 'agility', icon: 'trend', label: 'Ловкость' },
  { id: 'speed', icon: 'star', label: 'Скорость' },
];

function NeedRow({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-ink-400 w-16 shrink-0">{label}</span>
      <div className="meter flex-1">
        <span style={{ width: `${Math.max(3, value)}%`, background: value < 25 ? 'var(--clay)' : 'var(--moss)' }} />
      </div>
      <span className="num text-2xs text-ink-300 w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

export const DayPlannerView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [busy, setBusy] = useState<string | null>(null);
  if (!player) return null;

  const used = player.slotsUsed ?? 0;
  const left = Math.max(0, SLOTS_PER_DAY - used);
  const hunger = player.hunger ?? DEFAULT_HUNGER;

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
    <div className="deck animate-fade-in" aria-label={t('Сегодня')}>
      <HomeRoomCard />
      <DeckView variant="cards" />

      {/* Планер дня: слоты → нужды → статы → активности */}
      <section className="card space-y-2.5">
        <SectionTitle>{t('День — {p0} слотов', { p0: SLOTS_PER_DAY })}</SectionTitle>
        <div
          className="flex items-center gap-1.5"
          aria-label={t('Слоты дня: {p0} из {p1} свободно', { p0: left, p1: SLOTS_PER_DAY })}
        >
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 rounded-full ${i < used ? 'bg-ink-700' : 'bg-moss-300'}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <NeedRow label={t('Сытость')} value={hunger} />
      </section>

      <section className="card space-y-2">
        <SectionTitle>{t('Боевой треугольник')}</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {STATS.map((s) => {
            const lvl = player.combat?.[s.id]?.level ?? 5;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <PixelIcon name={s.icon} size={14} />
                <div className="min-w-0">
                  <div className="text-2xs text-ink-400">{s.label}</div>
                  <div className="num text-sm text-ink-100">{lvl}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <FightCard />

      <section className="card space-y-1.5">
        <SectionTitle>{t('Тренировка')}</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(TRAINING).map(([id, def]) => (
            <button
              key={id}
              className="btn btn-secondary text-xs justify-between"
              disabled={busy !== null || left < 1}
              onClick={() => void act('train', { activity: id }, id)}
            >
              <span>{t(def.label)}</span>
              <span className="num text-ink-500 text-2xs">
                1⚡ {def.energy} {def.money ? `· ${def.money}₽` : ''}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-1.5">
        <SectionTitle>{t('Еда')}</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(FOOD).map(([id, def]) => (
            <button
              key={id}
              className="btn btn-secondary text-xs justify-between"
              disabled={busy !== null}
              onClick={() => void act('eat', { tier: id }, id)}
            >
              <span>{t(def.label)}</span>
              <span className="num text-ink-500 text-2xs">{def.money}₽</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-1.5">
        <SectionTitle>{t('Отдых и работа')}</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(REST).map(([id, def]) => (
            <button
              key={id}
              className="btn btn-secondary text-xs justify-between"
              disabled={busy !== null || left < 1}
              onClick={() => void act('rest', { activity: id }, id)}
            >
              <span>{t(def.label)}</span>
              <span className="num text-ink-500 text-2xs">1⚡ {def.money ? `· ${def.money}₽` : ''}</span>
            </button>
          ))}
          <button
            className="btn btn-secondary text-xs justify-between"
            disabled={busy !== null || left < 2 || !player.job}
            onClick={() => void act('work_shift', {}, 'work')}
          >
            <span>{t('Смена на работе')}</span>
            <span className="num text-ink-500 text-2xs">2⚡</span>
          </button>
          <button
            className="btn btn-secondary text-xs justify-between"
            disabled={busy !== null || left < 2}
            onClick={() => void act('order_work', {}, 'order')}
          >
            <span>{t('Заказ на фрилансе')}</span>
            <span className="num text-ink-500 text-2xs">2⚡</span>
          </button>
        </div>
      </section>
    </div>
  );
};
