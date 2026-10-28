import { t } from '../lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DeckCard, DeckCost } from './DeckCard';
import { collectReadyHints, firstStepsItems, useFirstSteps, type Hint } from './MorningBrief';
import { HomeRoomCard } from './HomeRoomCard';
import { SprintCard } from './SprintCard';
import { PixelIcon } from './pixel/PixelIcon';
import { pickDayPlan } from '../screens/dayPlan';
import { tipForDay } from '../screens/dayTips';

/**
 * Стек дня (DESIGN-DECK §3): утро → крючки → действия → вечер.
 *
 * Одна активная карточка = одно решение; выполненные улетают, счётчик
 * «осталось N» — под стеком. Приоритеты сюжета не меняются: GameScreen
 * показывает `daySummary > activeEvent > стек`.
 */
type Slot =
  | { kind: 'morning' }
  | { kind: 'hooks'; hints: Hint[]; steps: ReturnType<typeof firstStepsItems> }
  | { kind: 'action'; action: ReturnType<typeof pickDayPlan>[number]; done: boolean }
  | { kind: 'sprint' }
  | { kind: 'end' };

function buildQueue(player: any, careerOutlook: any, steps: ReturnType<typeof useFirstSteps>): Slot[] {
  const queue: Slot[] = [{ kind: 'morning' }];
  const hints = collectReadyHints(player, careerOutlook);
  const firstSteps = firstStepsItems(player, steps);
  if (hints.length > 0 || firstSteps) queue.push({ kind: 'hooks', hints, steps: firstSteps });
  for (const action of pickDayPlan(player).slice(0, 5)) {
    queue.push({ kind: 'action', action, done: false });
  }
  if (player?.sprint) queue.push({ kind: 'sprint' });
  queue.push({ kind: 'end' });
  return queue;
}

export const DeckView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const careerOutlook = useGameStore((s) => s.careerOutlook);
  const setView = useGameStore((s) => s.setView);
  const performAction = useGameStore((s) => s.performAction);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const steps = useFirstSteps();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const day = player?.currentDay ?? 1;
  // Очередь — «снимок утра»: карточки не перетасовываются после каждого
  // действия (план меняется, стек — нет). Поэтому зависимость только `day`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => buildQueue(player, careerOutlook, steps), [day]);
  // новый день — новый стек
  useEffect(() => {
    setIndex(0);
  }, [day]);
  if (!player) return null;
  const slot = queue[Math.min(index, queue.length - 1)];
  const left = queue.length - index;

  const next = () => setIndex((i) => i + 1);
  const runAction = async (id: string) => {
    setBusy(true);
    try {
      await performAction(id, { skillId: player.mainSkillId || 'javascript' });
    } finally {
      setBusy(false);
    }
    next();
  };

  return (
    <div className="deck animate-fade-in" aria-label={t('Сегодня')}>
      {/* сцена: комната над стеком — контекст, а не решение */}
      <HomeRoomCard />

      <div className="deck-stage">
        {slot.kind === 'morning' && (
          <DeckCard
            id="morning"
            icon="calendar"
            tone="day"
            title={t('День {p0}', { p0: day })}
            flavor={tipForDay(day)?.body}
            right={{ label: t('Дальше'), run: next, tone: 'ghost' }}
          />
        )}

        {slot.kind === 'hooks' && (
          <DeckCard id="hooks" icon="target" tone="hook" title={t('Что почти готово')} right={{ label: t('Дальше'), run: next, tone: 'ghost' }}>
            <ul className="deck-rows" data-testid={slot.steps ? 'first-steps' : undefined}>
              {slot.hints.slice(0, 2).map((h) => (
                <li key={h.id}>
                  <button className="deck-row" onClick={() => h.view && setView(h.view)}>
                    <PixelIcon name={h.icon} size={14} />
                    <span className="flex-1 min-w-0 text-left text-xs text-ink-200">{h.text}</span>
                    {h.view && <span className="text-ink-600" aria-hidden="true">→</span>}
                  </button>
                </li>
              ))}
              {slot.steps?.map((it) => (
                <li key={it.id}>
                  <button className="deck-row" data-done={it.done} onClick={() => it.view && setView(it.view)}>
                    <PixelIcon name={it.done ? 'check' : 'target'} size={14} />
                    <span className={`flex-1 min-w-0 text-left text-xs ${it.done ? 'text-ink-500 line-through' : 'text-ink-200'}`}>
                      {it.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DeckCard>
        )}

        {slot.kind === 'action' && (
          <DeckCard
            id={slot.action.id}
            icon={slot.action.icon}
            title={slot.action.name}
            meta={
              <DeckCost
                energy={slot.action.energy}
                cost={slot.action.cost}
                reward={slot.action.category === 'work' ? t('премия + XP') : t('опыт × мотивация')}
              />
            }
            flavor={slot.action.hint}
            busy={busy}
            left={{ label: t('Пропустить'), run: next, tone: 'ghost' }}
            right={{ label: t('Сделать'), run: () => runAction(slot.action.id) }}
          />
        )}

        {slot.kind === 'sprint' && (
          <DeckCard id="sprint" icon="trophy" tone="hook" title={t('Спринт недели')} right={{ label: t('Дальше'), run: next, tone: 'ghost' }}>
            <SprintCard />
          </DeckCard>
        )}

        {slot.kind === 'end' && (
          <DeckCard
            id="end"
            icon="moon"
            tone="end"
            title={t('Завершить день')}
            flavor={t('Сводка покажет, чем запомнился день')}
            busy={busy}
            right={{
              label: t('Завершить'),
              run: async () => {
                setBusy(true);
                try {
                  await advanceDay();
                } finally {
                  setBusy(false);
                }
              },
            }}
          />
        )}
      </div>

      <div className="deck-footer">
        <span className="deck-dots num" aria-label={t('Осталось карточек: {p0}', { p0: left })}>
          {t('Осталось карточек: {p0}', { p0: left })}
        </span>
        <button className="btn btn-ghost deck-btn" onClick={() => setView('overview')}>
          {t('Все детали дня')} →
        </button>
      </div>
    </div>
  );
};
