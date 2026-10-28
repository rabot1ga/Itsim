import { t } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { readFirstSteps, type FirstSteps } from '../lib/firstSteps';
import { PixelIcon } from './pixel/PixelIcon';
import { SectionTitle } from './ui';

/**
 * Утренняя сводка «Сегодня» (аудит 28.10):
 *
 * G — карточка «Почти готово»: крючки Зейгарника между сессиями (сгорающий
 * оффер, дедлайн проекта, близкое ревью, зарплата). Показываем до двух строк,
 * самое срочное сверху.
 *
 * B — чек-лист «Первые шаги»: обучение деланием вместо лекций. Живёт первые
 * дни и скрывается, когда все три шага закрыты.
 */
export function useFirstSteps(): FirstSteps {
  const [steps, setSteps] = useState<FirstSteps>(() => readFirstSteps());
  useEffect(() => {
    const sync = () => setSteps(readFirstSteps());
    window.addEventListener('firststeps', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('firststeps', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return steps;
}

export interface Hint {
  id: string;
  icon: string;
  text: string;
  view?: string;
}

/** G: крючки «почти готово» — для карточки стека и старого вида */
export function collectReadyHints(player: any, careerOutlook: any): Hint[] {
  const day = player?.currentDay ?? 1;
  const hints: Hint[] = [];
  if (!player) return hints;

  // оффер сгорает
  const offer = (player.pendingOffers ?? []).find((o: any) => (o.expiresInDays ?? 99) <= 2 && o.expiresInDays > 0);
  if (offer) {
    hints.push({
      id: 'offer',
      icon: 'star',
      text: t('Оффер «{p0}» сгорает через {p1} дн. — прими его в «Карьере»', {
        p0: offer.position,
        p1: offer.expiresInDays,
      }),
      view: 'career',
    });
  }

  // проект у дедлайна
  const project = player.activeProject;
  if (project && typeof project.deadlineDay === 'number') {
    const left = project.deadlineDay - day;
    if (left >= 0 && left <= 2) {
      hints.push({
        id: 'project',
        icon: 'clip',
        text:
          left === 0
            ? t('Проект сдать сегодня — закрой задачи в «Карьере»')
            : t('Проект: {p0} дн. до дедлайна', { p0: left }),
        view: 'career',
      });
    }
  }

  // ревью на повышение близко
  if (careerOutlook?.kind === 'promotion' && careerOutlook.ready && (careerOutlook.daysToReview ?? 99) <= 3) {
    hints.push({
      id: 'review',
      icon: 'chart',
      text:
        careerOutlook.daysToReview === 0
          ? t('Ревью на «{p0}» — сегодня', { p0: careerOutlook.label })
          : t('Ревью на «{p0}» через {p1} дн.', { p0: careerOutlook.label, p1: careerOutlook.daysToReview }),
      view: 'career',
    });
  }

  // отклик на бирже ждёт ответа
  if (player.freelanceBid && player.freelanceBid.day === day - 1) {
    hints.push({ id: 'bid', icon: 'chip', text: t('Отклик на бирже: заказчик ответит утром'), view: 'career' });
  }

  // зарплата скоро
  if (player.job) {
    const toPayday = (7 - (day % 7)) % 7;
    if (toPayday <= 2) {
      hints.push({
        id: 'payday',
        icon: 'coin',
        text: toPayday === 0 ? t('Сегодня зарплата') : t('Зарплата через {p0} дн.', { p0: toPayday }),
      });
    }
  }
  return hints;
}

export const ReadyCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const careerOutlook = useGameStore((s) => s.careerOutlook);
  const setView = useGameStore((s) => s.setView);
  const hints = collectReadyHints(player, careerOutlook);
  if (hints.length === 0) return null;
  return (
    <section className="card animate-pop-in" aria-label={t('Почти готово')}>
      <SectionTitle className="mb-2">{t('Что почти готово')}</SectionTitle>
      <div className="space-y-1.5">
        {hints.slice(0, 2).map((h) => (
          <button
            key={h.id}
            className="tile flex items-center gap-2 w-full text-left"
            onClick={() => h.view && setView(h.view)}
          >
            <PixelIcon name={h.icon} size={14} />
            <span className="flex-1 min-w-0 text-xs text-ink-200">{h.text}</span>
            {h.view && (
              <span className="text-ink-600 shrink-0" aria-hidden="true">
                →
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};

export interface FirstStepsItem {
  id: string;
  done: boolean;
  text: string;
  view?: string;
}

/** B: чек-лист «Первые шаги» — строки для карточки стека и старого вида */
export function firstStepsItems(player: any, steps: FirstSteps): FirstStepsItem[] | null {
  if (!player) return null;
  const dayDone = (player.currentDay ?? 1) >= 2;
  const all = steps.action && steps.focus && dayDone;
  if (all || (player.currentDay ?? 1) > 4) return null;
  return [
    { id: 'action', done: steps.action, text: t('Выполни любое действие из плана дня') },
    { id: 'day', done: dayDone, text: t('Заверши день и посмотри сводку') },
    { id: 'focus', done: steps.focus, text: t('Выбери основной навык во вкладке «Развитие»'), view: 'skills' },
  ];
}

export const FirstStepsCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const steps = useFirstSteps();
  const items = firstStepsItems(player, steps);
  if (!items) return null;
  return (
    <section className="card animate-pop-in" aria-label={t('Первые шаги')} data-testid="first-steps">
      <SectionTitle className="mb-2">{t('Первые шаги')}</SectionTitle>
      <div className="space-y-1.5">
        {items.map((it) => (
          <button
            key={it.id}
            className="tile flex items-center gap-2 w-full text-left"
            data-done={it.done}
            onClick={() => it.view && setView(it.view)}
          >
            <PixelIcon name={it.done ? 'check' : 'target'} size={14} />
            <span className={`flex-1 min-w-0 text-xs ${it.done ? 'text-ink-500 line-through' : 'text-ink-200'}`}>
              {it.text}
            </span>
            {it.view && !it.done && (
              <span className="text-ink-600 shrink-0" aria-hidden="true">
                →
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};
