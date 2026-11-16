import { t, fmtNumber } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import {
  ProjectDef,
  bidChance,
  consolationPayment,
  projectBlockedReason,
  projectComplete,
  projectDaysLeft,
  projectProgress,
} from '@itsim/shared';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState } from './ui';
/**
 * Биржа заказов — the «Работа» screen of reference 1.png.
 *
 * A contract is not handed out on tap any more: the player answers the ad
 * («Откликнуться», −3 ), and the client sleeps on it. In the morning one of
 * three things happens — signed, paid for the test task, or picked someone
 * else. That is why the freelance action and the board are one thing now
 * instead of two doors to the same money.
 */
function fmtMoney(amount: number): string {
  return `${fmtNumber(amount)} ₽`;
}
function deadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return t('просрочен');
  if (daysLeft === 0) return t('сегодня');
  if (daysLeft === 1) return t('1 день');
  return t('{daysLeft} дн.', { daysLeft: daysLeft });
}
/** Content ships pixel-icon names; the chrome speaks emoji. */
const PROJECT_EMOJI: Record<string, string> = {
  screen: '',
  chat: '',
  rocket: '',
  briefcase: '',
  chart: '',
  cap: '',
  coin: '',
  mug: '',
};
const projectEmoji = (icon?: string) => PROJECT_EMOJI[icon ?? ''] ?? '';
/** Energy the server charges for a bid (`EXTRA_ENERGY_COSTS.freelance`). */
const BID_ENERGY = 3;
export const ProjectBoard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [projects, setProjects] = useState<ProjectDef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch('/api/content/projects', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('content'))))
      .then((data) => setProjects(Array.isArray(data.projects) ? data.projects : []))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);
  if (!player) return null;
  const act = async (actionId: string, params?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await performAction(actionId, params);
    } finally {
      setBusy(false);
    }
  };
  const active = player.activeProject ?? null;
  const bid = player.freelanceBid ?? null;
  const bidDef = bid ? ((projects ?? []).find((p) => p.id === bid.projectId) ?? null) : null;
  const activeDef = active ? ((projects ?? []).find((p) => p.id === active.id) ?? null) : null;
  const skillLevel = player.skills?.[player.mainSkillId ?? '']?.level ?? 0;
  const done = new Set(player.projectsDone ?? []);
  return (
    <section className="project-board" aria-label={t('Заказы')}>
      <h3 className="section-title">{t('Биржа заказов')}</h3>

      {failed && (
        <div role="alert" className="well text-xs text-clay-300">
          {t('Не удалось загрузить проекты.')}
          <button className="btn btn-secondary mt-2" onClick={() => setAttempt((n) => n + 1)}>
            {t('Повторить загрузку')}
          </button>
        </div>
      )}
      {!projects && !failed && <Spinner label={t('Загрузка проектов…')} />}

      {bid && (
        <article className="card card-sm panel-note panel-note-sky" aria-label={t('Отклик отправлен')}>
          <img className="project-art" src="/art/story-v1/freelance.webp" alt="" width={384} height={230} />
          <p className="text-sm text-ink-100">
            <span aria-hidden="true"> </span>
            {t('Отклик на «')}
            {bidDef?.title ?? t('заказ')}
            {t('» отправлен')}
          </p>
          <p className="text-xs text-ink-400 mt-1 leading-relaxed">
            {t('Заказчик ответит утром: шанс')} <span className="num">{Math.round(bid.chance * 100)}%</span>
            {t('. Не выгорит — останется оплаченное тестовое.')}
          </p>
        </article>
      )}

      {active && activeDef && (
        <article className="project-active" aria-label={t('Активный проект: {p0}', { p0: activeDef.title })}>
          <img className="project-art" src="/art/story-v1/contract.webp" alt="" width={384} height={230} />
          <div className="project-active-head">
            <span className="text-lg leading-none" aria-hidden="true">
              {projectEmoji(activeDef.icon)}
            </span>
            <div className="min-w-0">
              <p className="project-title">{activeDef.title}</p>
              <p className="project-subtitle">{activeDef.subtitle}</p>
            </div>
            <span className="num project-percent">{projectProgress(activeDef, active)}%</span>
          </div>
          <div
            className="meter"
            role="progressbar"
            aria-label={t('Прогресс проекта {p0}', { p0: activeDef.title })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={projectProgress(activeDef, active)}
          >
            <span style={{ width: `${projectProgress(activeDef, active)}%`, background: 'var(--green)' }} />
          </div>
          <p className={`project-deadline ${projectDaysLeft(active, player.currentDay) < 0 ? 'is-late' : ''}`}>
            {t('Дедлайн: день')} {active.deadlineDay} · {deadlineLabel(projectDaysLeft(active, player.currentDay))}
          </p>

          <h4 className="project-tasks-title">{t('Активные задачи')}</h4>
          <ul className="project-tasks">
            {activeDef.tasks.map((task) => {
              const isDone = active.tasksDone.includes(task.id);
              const affordable = player.energy >= task.energy;
              return (
                <li key={task.id} className={isDone ? 'is-done' : ''}>
                  <span className="project-task-title">{task.title}</span>
                  {isDone ? (
                    <span className="project-task-done">{t('✓ готово')}</span>
                  ) : (
                    <button
                      disabled={busy || !affordable}
                      onClick={() => act('project_task', { projectId: activeDef.id, taskId: task.id })}
                    >
                      +{task.xp} XP · −{task.energy}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="project-active-actions">
            <button
              className="btn btn-sm btn-primary"
              disabled={busy || !projectComplete(activeDef, active)}
              onClick={() => act('deliver_project')}
            >
              {projectComplete(activeDef, active)
                ? t('Сдать за {p0}', { p0: fmtMoney(activeDef.payment) })
                : t('Сдать проект')}
            </button>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act('drop_project')}>
              {t('Отказаться')}
            </button>
          </div>
        </article>
      )}

      {active && !activeDef && projects && (
        <p className="well text-xs text-ink-400">
          {t('Взятый проект больше не входит в каталог. Он закроется при смене дня.')}
        </p>
      )}

      {projects && projects.length > 0 && (
        <>
          <h4 className="project-tasks-title">{t('Открытые заказы')}</h4>
          <div className="space-y-2">
            {projects.map((def) => {
              const blocked = projectBlockedReason(def, { activeProject: active, skillLevel, pendingBid: bid });
              const chance = bidChance(def, { skillLevel, reputation: player.reputation ?? 0 });
              const tired = player.energy < BID_ENERGY;
              return (
                <article key={def.id} className="project-offer" aria-label={def.title}>
                  <span className="text-lg leading-none shrink-0" aria-hidden="true">
                    {projectEmoji(def.icon)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="project-title">{def.title}</p>
                    <p className="project-subtitle">{def.subtitle}</p>
                    <p className="project-terms num">
                      {t('Оплата:')} {fmtMoney(def.payment)} {t('· дедлайн')} {def.deadlineDays} {t('дн. ·')}{' '}
                      {def.tasks.length} {t('задач')}
                    </p>
                    {!blocked && (
                      <p className="project-terms">
                        {t('Шанс получить:')} <span className="num">{Math.round(chance * 100)}%</span> {t('· мимо —')}{' '}
                        <span className="num">{fmtMoney(consolationPayment(def))}</span> {t('за тестовое')}
                      </p>
                    )}
                    {done.has(def.id) && <p className="project-terms">{t('Уже сдавался в этой жизни')}</p>}
                    {blocked && <p className="project-blocked">{blocked}</p>}
                  </div>
                  <button
                    className="btn btn-sm btn-primary project-take"
                    disabled={busy || blocked !== null || tired}
                    title={tired ? t('Нужно {BID_ENERGY}', { BID_ENERGY: BID_ENERGY }) : t('Ответ придёт утром')}
                    onClick={() => act('freelance', { projectId: def.id })}
                  >
                    {t('Откликнуться')}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
      {projects && projects.length === 0 && !failed && (
        <EmptyState
          icon="laptop"
          title={t('Заказчики пока молчат')}
          hint={t('Загляни завтра — новые заказы приходят с утра.')}
        />
      )}
      <p className="text-2xs text-ink-600">
        {t('Один отклик в день, −')}
        {BID_ENERGY} {t('. Заказчик отвечает утром: контракт, оплаченное тестовое или отказ.')}
      </p>
    </section>
  );
};
