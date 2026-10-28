import { t } from '../lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DeckCard, DeckCost } from './DeckCard';
import { DeckInterview } from './DeckInterview';
import { collectReadyHints, firstStepsItems, useFirstSteps, type Hint } from './MorningBrief';
import { HomeRoomCard } from './HomeRoomCard';
import { SprintCard } from './SprintCard';
import { PixelIcon } from './pixel/PixelIcon';
import { pickDayPlan } from '../screens/dayPlan';
import { tipForDay } from '../screens/dayTips';
import { ONBOARDING_KEY } from '../lib/firstSteps';
import { projectComplete, projectDaysLeft, projectProgress, type ProjectDef } from '@itsim/shared';

/**
 * Стек дня (DESIGN-DECK §3): интро → утро → собеседование → крючки →
 * проект → действия → вечер. Одна активная карточка = одно решение.
 * Приоритеты сюжета не меняются: GameScreen показывает
 * `daySummary > activeEvent > стек`.
 */
type Slot =
  | { kind: 'intro'; step: 0 | 1 }
  | { kind: 'morning' }
  | { kind: 'interview' }
  | { kind: 'hooks'; hints: Hint[]; steps: ReturnType<typeof firstStepsItems> }
  | { kind: 'project' }
  | { kind: 'action'; action: ReturnType<typeof pickDayPlan>[number] }
  | { kind: 'sprint' }
  | { kind: 'end' };

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true; // приватный режим — без интро-карточек
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* опционально */
  }
}

function buildQueue(
  player: any,
  careerOutlook: any,
  steps: ReturnType<typeof useFirstSteps>,
  onboarded: boolean
): Slot[] {
  const queue: Slot[] = [];
  // B: онбординг — первые карточки стека, а не лекция перед игрой
  if (!onboarded) queue.push({ kind: 'intro', step: 0 }, { kind: 'intro', step: 1 });
  queue.push({ kind: 'morning' });
  if (player?.currentApplication?.status === 'interview_scheduled') queue.push({ kind: 'interview' });
  const hints = collectReadyHints(player, careerOutlook);
  const firstSteps = firstStepsItems(player, steps);
  if (hints.length > 0 || firstSteps) queue.push({ kind: 'hooks', hints, steps: firstSteps });
  if (player?.activeProject) queue.push({ kind: 'project' });
  for (const action of pickDayPlan(player).slice(0, 5)) {
    queue.push({ kind: 'action', action });
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
  const [onboarded, setOnboarded] = useState(readOnboarded);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [defs, setDefs] = useState<ProjectDef[] | null>(null);
  const day = player?.currentDay ?? 1;

  // определения проектов — для карточки проекта (как в ProjectBoard)
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/content/projects', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('content'))))
      .then((data) => setDefs(Array.isArray(data.projects) ? data.projects : []))
      .catch(() => {
        if (!controller.signal.aborted) setDefs([]);
      });
    return () => controller.abort();
  }, []);

  // Очередь — «снимок утра»: карточки не перетасовываются после каждого
  // действия (план меняется, стек — нет). Поэтому зависимость только `day`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => buildQueue(player, careerOutlook, steps, onboarded), [day, onboarded]);
  // новый день — новый стек
  useEffect(() => {
    setIndex(0);
  }, [day]);
  if (!player) return null;
  const slot = queue[Math.min(index, queue.length - 1)];
  const left = queue.length - index;
  const introCount = onboarded ? 0 : 2;

  const next = () => setIndex((i) => i + 1);
  const skipIntro = () => {
    markOnboarded();
    setOnboarded(true);
    // стек перестраивается без интро: утро снова нулевая карточка
    setIndex(0);
  };
  const passIntro = () => {
    if (index + 1 >= introCount) {
      markOnboarded();
      setOnboarded(true);
      setIndex(0);
      return;
    }
    next();
  };
  const runAction = async (id: string, params?: any) => {
    setBusy(true);
    try {
      await performAction(id, params ?? { skillId: player.mainSkillId || 'javascript' });
    } finally {
      setBusy(false);
    }
    next();
  };

  // проект: карточка живёт, пока игрок сам не уйдёт («Позже»)
  const active = player.activeProject as any;
  const def = active && defs ? defs.find((d) => d.id === active.id) : undefined;
  const nextTask = def && active ? def.tasks.find((tk) => !active.tasksDone?.includes(tk.id)) : undefined;

  return (
    <div className="deck animate-fade-in" aria-label={t('Сегодня')}>
      {/* сцена: комната над стеком — контекст, а не решение */}
      <HomeRoomCard />

      <div className="deck-stage">
        {slot.kind === 'intro' &&
          (slot.step === 0 ? (
            <DeckCard
              id="intro-1"
              icon="star"
              tone="day"
              title={t('Симулятор жизни айтишника')}
              flavor={t('Живи, работай, развивайся. Каждый день — новый выбор и новые последствия.')}
              left={{ label: t('Пропустить'), run: skipIntro, tone: 'ghost' }}
              right={{ label: t('Дальше'), run: passIntro }}
            />
          ) : (
            <DeckCard
              id="intro-2"
              icon="bolt"
              tone="day"
              title={t('Каждый день — это энергия')}
              flavor={t('Учёба, работа и отдых тратят энергию. Настроение и здоровье решают, сколько ты выдержишь.')}
              right={{ label: t('Начать жизнь'), run: passIntro }}
            />
          ))}

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

        {slot.kind === 'interview' && <DeckInterview onDone={next} />}

        {slot.kind === 'hooks' && (
          <DeckCard
            id="hooks"
            icon="target"
            tone="hook"
            title={t('Что почти готово')}
            right={{ label: t('Дальше'), run: next, tone: 'ghost' }}
          >
            <ul className="deck-rows" data-testid={slot.steps ? 'first-steps' : undefined}>
              {slot.hints.slice(0, 2).map((h) => (
                <li key={h.id}>
                  <button className="deck-row" onClick={() => h.view && setView(h.view)}>
                    <PixelIcon name={h.icon} size={14} />
                    <span className="flex-1 min-w-0 text-left text-xs text-ink-200">{h.text}</span>
                    {h.view && (
                      <span className="text-ink-600" aria-hidden="true">
                        →
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {slot.steps?.map((it) => (
                <li key={it.id}>
                  <button className="deck-row" data-done={it.done} onClick={() => it.view && setView(it.view)}>
                    <PixelIcon name={it.done ? 'check' : 'target'} size={14} />
                    <span
                      className={`flex-1 min-w-0 text-left text-xs ${it.done ? 'text-ink-500 line-through' : 'text-ink-200'}`}
                    >
                      {it.text}
                    </span>
                  </button>
                </li>
              ))}
              {/* F: pity-метка — серия отказов видимо повышает шанс */}
              {(player.freelanceRejectStreak ?? 0) > 0 && (
                <li>
                  <span className="deck-row" data-testid="luck-row">
                    <PixelIcon name="dice" size={14} />
                    <span className="flex-1 min-w-0 text-left text-xs text-ink-200">
                      {t('повезёт: следующий отклик +{p0}%', {
                        p0: Math.round(Math.min(4, player.freelanceRejectStreak) * 7),
                      })}
                    </span>
                  </span>
                </li>
              )}
              {(player.interviewRejectStreak ?? 0) > 0 && (
                <li>
                  <span className="deck-row" data-testid="luck-row">
                    <PixelIcon name="dice" size={14} />
                    <span className="flex-1 min-w-0 text-left text-xs text-ink-200">
                      {t('повезёт: следующее собеседование +{p0}%', {
                        p0: Math.round(Math.min(4, player.interviewRejectStreak) * 7),
                      })}
                    </span>
                  </span>
                </li>
              )}
            </ul>
          </DeckCard>
        )}

        {slot.kind === 'project' && (
          <DeckCard
            id="project"
            icon="laptop"
            tone="hook"
            title={def ? def.title : t('Активный проект')}
            meta={
              def && active ? (
                <span className="deck-cost num">
                  {t('Задач: {p0}/{p1}', {
                    p0: active.tasksDone?.length ?? 0,
                    p1: def.tasks.length,
                  })}{' '}
                  · {t('дедлайн через {p0} дн.', { p0: projectDaysLeft(active, day) })}
                </span>
              ) : undefined
            }
            flavor={
              nextTask
                ? nextTask.title
                : def && active && projectComplete(def, active)
                  ? t('Все задачи готовы — можно сдавать')
                  : undefined
            }
            busy={busy}
            left={{ label: t('Позже'), run: next, tone: 'ghost' }}
            right={
              def && active && projectComplete(def, active)
                ? { label: t('Сдать за {p0}', { p0: `${def.payment} ₽` }), run: () => runAction('deliver_project') }
                : nextTask
                  ? {
                      label: t('Закрыть задачу'),
                      run: async () => {
                        setBusy(true);
                        try {
                          await performAction('project_task', { projectId: def!.id, taskId: nextTask.id });
                        } finally {
                          setBusy(false);
                        }
                      },
                    }
                  : { label: t('Все детали дня'), run: () => setView('career'), tone: 'ghost' }
            }
          >
            {def && active && (
              <div
                className="meter"
                role="progressbar"
                aria-label={t('Прогресс проекта {p0}', { p0: def.title })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={projectProgress(def, active)}
              >
                <span style={{ width: `${projectProgress(def, active)}%`, background: 'var(--green)' }} />
              </div>
            )}
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
          <DeckCard
            id="sprint"
            icon="trophy"
            tone="hook"
            title={t('Спринт недели')}
            right={{ label: t('Дальше'), run: next, tone: 'ghost' }}
          >
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
