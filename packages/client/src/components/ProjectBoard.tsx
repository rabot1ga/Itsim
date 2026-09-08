import React, { useEffect, useState } from 'react';
import {
  ProjectDef,
  projectBlockedReason,
  projectComplete,
  projectDaysLeft,
  projectProgress,
} from '@itsim/shared';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';
import { Spinner } from './ui';

/**
 * Project board — the «Работа» screen of reference 1.png.
 *
 * The reference shows a contract with a deadline, a progress bar, a checklist
 * of tasks and a list of offers with a payment. All of that is real state
 * here: the catalogue comes from /api/content/projects and every tap is a
 * server action, so a deadline that passes really costs reputation.
 */

function fmtMoney(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function deadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return 'просрочен';
  if (daysLeft === 0) return 'сегодня';
  if (daysLeft === 1) return '1 день';
  return `${daysLeft} дн.`;
}

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
  const activeDef = active ? (projects ?? []).find((p) => p.id === active.id) ?? null : null;
  const skillLevel = player.skills?.[player.mainSkillId ?? '']?.level ?? 0;
  const done = new Set(player.projectsDone ?? []);

  return (
    <section className="project-board" aria-label="Проекты">
      <h3 className="section-title">Проекты</h3>

      {failed && (
        <div role="alert" className="well text-xs text-clay-300">
          Не удалось загрузить проекты.
          <button className="btn btn-secondary mt-2" onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!projects && !failed && <Spinner label="Загрузка проектов…" />}

      {active && activeDef && (
        <article className="project-active" aria-label={`Активный проект: ${activeDef.title}`}>
          <div className="project-active-head">
            <PixelIcon name={activeDef.icon} size={16} className="text-sky-300" />
            <div className="min-w-0">
              <p className="project-title">{activeDef.title}</p>
              <p className="project-subtitle">{activeDef.subtitle}</p>
            </div>
            <span className="num project-percent">{projectProgress(activeDef, active)}%</span>
          </div>
          <div
            className="meter"
            role="progressbar"
            aria-label={`Прогресс проекта ${activeDef.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={projectProgress(activeDef, active)}
          >
            <span style={{ width: `${projectProgress(activeDef, active)}%`, background: 'var(--moss)' }} />
          </div>
          <p className={`project-deadline ${projectDaysLeft(active, player.currentDay) < 0 ? 'is-late' : ''}`}>
            Дедлайн: день {active.deadlineDay} · {deadlineLabel(projectDaysLeft(active, player.currentDay))}
          </p>

          <h4 className="project-tasks-title">Активные задачи</h4>
          <ul className="project-tasks">
            {activeDef.tasks.map((task) => {
              const isDone = active.tasksDone.includes(task.id);
              const affordable = player.energy >= task.energy;
              return (
                <li key={task.id} className={isDone ? 'is-done' : ''}>
                  <span className="project-task-title">{task.title}</span>
                  {isDone ? (
                    <span className="project-task-done">
                      <PixelIcon name="check" size={10} /> готово
                    </span>
                  ) : (
                    <button
                      disabled={busy || !affordable}
                      onClick={() => act('project_task', { projectId: activeDef.id, taskId: task.id })}
                    >
                      +{task.xp} XP · −{task.energy}
                      <PixelIcon name="arrow" size={9} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="project-active-actions">
            <button
              className="btn btn-primary text-xs"
              disabled={busy || !projectComplete(activeDef, active)}
              onClick={() => act('deliver_project')}
            >
              {projectComplete(activeDef, active) ? `Сдать за ${fmtMoney(activeDef.payment)}` : 'Сдать проект'}
            </button>
            <button className="btn btn-ghost text-xs" disabled={busy} onClick={() => act('drop_project')}>
              Отказаться
            </button>
          </div>
        </article>
      )}

      {active && !activeDef && projects && (
        <p className="well text-xs text-ink-400">
          Взятый проект больше не входит в каталог. Он закроется при смене дня.
        </p>
      )}

      {projects && projects.length > 0 && (
        <>
          <h4 className="project-tasks-title">Доступные проекты</h4>
          <div className="space-y-2">
            {projects.map((def) => {
              const blocked = projectBlockedReason(def, { activeProject: active, skillLevel });
              return (
                <article key={def.id} className="project-offer" aria-label={def.title}>
                  <PixelIcon name={def.icon} size={16} className="text-ink-300 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="project-title">{def.title}</p>
                    <p className="project-subtitle">{def.subtitle}</p>
                    <p className="project-terms num">
                      Оплата: {fmtMoney(def.payment)} · дедлайн {def.deadlineDays} дн. · {def.tasks.length} задач
                    </p>
                    {done.has(def.id) && <p className="project-terms">Уже сдавался в этой жизни</p>}
                    {blocked && <p className="project-blocked">{blocked}</p>}
                  </div>
                  <button
                    className="btn btn-primary project-take text-xs"
                    disabled={busy || blocked !== null}
                    onClick={() => act('take_project', { projectId: def.id })}
                  >
                    Взять
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
      {projects && projects.length === 0 && !failed && (
        <p className="text-xs text-ink-400">Заказчики пока молчат — проектов нет.</p>
      )}
    </section>
  );
};
