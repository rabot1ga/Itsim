import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Weekly season sprint card (P1.2).
 *
 * One rotating theme per real week (Monday→Sunday, UTC+3); goals count
 * matching actions done that week. It renders below the daily challenge —
 * the day target shapes today, the week target shapes the week, and they
 * never pretend to be the same thing.
 *
 * Server data (store.sprint): { title, subtitle, icon, goals[{description,
 * count, progress, done}], allDone, claimed, reward{money,motivation,
 * reputation}, endsAtMs, daysLeft }.
 */

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 10_000) return `${Math.round(n / 1000)} тыс`;
  return n.toLocaleString('ru-RU');
}

export const SprintCard: React.FC = () => {
  const sprint = useGameStore((s) => s.sprint);
  const claimSprint = useGameStore((s) => s.claimSprint);
  const [busy, setBusy] = useState(false);

  if (!sprint) return null;

  const { reward } = sprint;
  const rewardParts: string[] = [];
  if (reward?.money) rewardParts.push(`+${fmtMoney(reward.money)} ₽`);
  if (reward?.motivation) rewardParts.push(`+${reward.motivation} настроения`);
  if (reward?.reputation) rewardParts.push(`+${reward.reputation} репутации`);
  const rewardLabel = rewardParts.join(' · ');

  const timeLeft =
    sprint.daysLeft > 1
      ? `осталось ${sprint.daysLeft} дн.`
      : sprint.daysLeft === 1
        ? 'остался 1 день'
        : 'последний день';

  const handleClaim = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await claimSprint();
    setBusy(false);
    if (!ok) {
      // claimSprint already surfaced the server error in the store banner
    }
  };

  return (
    <section className="card space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
          🗓
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-100">{sprint.title}</span>
            <span className="chip !py-0 text-2xs !text-ink-500" title={`Неделя с ${sprint.week}`}>
              {timeLeft}
            </span>
          </div>
          {sprint.subtitle && <p className="text-xs text-ink-400 leading-relaxed mt-0.5">{sprint.subtitle}</p>}
        </div>
      </div>

      {/* One goal per row: description, a thin meter, «n из m» — readable at a glance */}
      <div className="space-y-1.5">
        {sprint.goals?.map((g: any) => {
          const done = g.done;
          const pct = Math.min(100, Math.round((g.progress / Math.max(1, g.count)) * 100));
          return (
            <div key={g.id}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={done ? 'text-moss-300' : 'text-ink-200'}>
                  {g.progress} из {g.count} {g.description}
                </span>
                {done && (
                  <span className="text-moss-300" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
              <div className="meter mt-1">
                <span style={{ width: `${pct}%`, background: done ? 'var(--green)' : 'var(--gold)' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: the reward state — open, claimable, or banked */}
      {sprint.claimed ? (
        <p className="flex items-center gap-1.5 text-xs text-moss-300">
          <span aria-hidden="true">✓</span>
          Награда недели получена{rewardLabel ? `: ${rewardLabel}` : ''}
        </p>
      ) : sprint.allDone ? (
        <button onClick={() => void handleClaim()} disabled={busy} className="btn btn-primary w-full">
          {busy ? 'Забираем…' : `Забрать награду${rewardLabel ? ` · ${rewardLabel}` : ''}`}
        </button>
      ) : (
        rewardLabel && (
          <p className="flex items-center gap-1.5 text-2xs text-ink-500">
            <span aria-hidden="true">🔒</span>
            Выполни все цели до конца недели — награда {rewardLabel}
          </p>
        )
      )}
    </section>
  );
};
