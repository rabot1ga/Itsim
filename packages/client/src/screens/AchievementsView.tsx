import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, ScreenTitle, SectionTitle, ResChip } from '../components/ui';

/**
 * Achievements screen — all 17 achievements with earned state and
 * client-side progress bars (computed from player state + conditions).
 */

/** One emoji per goal type — the chrome speaks emoji (docs/design-system.md §1). */
const GOAL_EMOJI: Record<string, string> = {
  grade_reached: '💼',
  money_made: '💰',
  skill_level: '📚',
  days_survived: '📅',
  events_seen: '🎲',
  special: '⭐',
};

/** Coins paid out for a finished goal — mirrors the meta ledger on the server. */
const GOAL_REWARD: Record<string, number> = {
  grade_reached: 150,
  money_made: 100,
  skill_level: 80,
  days_survived: 60,
  events_seen: 60,
  special: 120,
};

interface AchievementInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: { type: string; target?: string | number };
}

const GRADE_INDEX = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];

export const AchievementsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [achievements, setAchievements] = useState<AchievementInfo[]>([]);

  useEffect(() => {
    fetch('/api/content/achievements')
      .then((r) => r.json())
      .then((data) => setAchievements(data.achievements ?? []))
      .catch(() => setAchievements([]));
  }, []);

  if (!player) return null;

  const earned = new Set(player.achievements ?? []);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + h.count, 0);
  const maxSkillLevel = Object.values(player.skills ?? {}).reduce(
    (max: number, s: any) => Math.max(max, s.level ?? 0),
    0
  );

  const progress = (a: AchievementInfo): { value: number; target: number } => {
    const t = Number(a.condition.target ?? 0);
    switch (a.condition.type) {
      case 'grade_reached':
        return { value: GRADE_INDEX.indexOf(player.grade), target: GRADE_INDEX.indexOf(String(a.condition.target)) };
      case 'money_made':
        return { value: Math.round(player.money ?? 0), target: t };
      case 'skill_level':
        return { value: maxSkillLevel, target: t };
      case 'days_survived':
        return { value: player.currentDay ?? 0, target: t };
      case 'events_seen':
        return { value: eventsSeen, target: t };
      case 'special':
        switch (a.condition.target) {
          case 'fullstack':
            return {
              value:
                Math.max(0, player.skills?.['javascript']?.level ?? 0) +
                Math.max(0, player.skills?.['python']?.level ?? 0),
              target: 60,
            };
          case 'burnout':
            return { value: player.burnoutDays ?? 0, target: 5 };
          case 'reputation_80':
            return { value: Math.round(player.reputation ?? 0), target: 80 };
          case 'mining_100k':
            return { value: Math.round(player.miningEarned ?? 0), target: 100000 };
          case 'mining_1m':
            return { value: Math.round(player.miningEarned ?? 0), target: 1000000 };
          default:
            return { value: 0, target: 1 };
        }
      default:
        return { value: 0, target: 1 };
    }
  };

  const earnedCount = achievements.filter((a) => earned.has(a.id)).length;
  const goals = achievements.filter((a) => !earned.has(a.id));
  const trophies = achievements.filter((a) => earned.has(a.id));

  const GoalRow: React.FC<{ a: AchievementInfo; done: boolean }> = ({ a, done }) => {
    const { value, target } = progress(a);
    const pct = Math.max(0, Math.min(100, (value / Math.max(1, target)) * 100));
    return (
      <div className={`card card-sm goal-row ${done ? 'panel-note panel-note-gold' : ''}`}>
        <span className={`goal-check ${done ? 'is-done' : ''}`} aria-hidden="true">
          {done ? '✓' : ''}
        </span>
        <span className={`goal-icon ${done ? 'is-done' : ''}`} aria-hidden="true">
          {GOAL_EMOJI[a.condition.type] ?? '🏆'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-semibold ${done ? 'text-gold-300' : 'text-ink-100'}`}>{a.name}</span>
            <span className="goal-reward num">
              {done ? 'выполнено' : `+${GOAL_REWARD[a.condition.type] ?? 60}`}
              {!done && <span aria-hidden="true">🪙</span>}
            </span>
          </div>
          <p className="text-xs text-ink-500 leading-relaxed mt-0.5">{a.description}</p>
          {!done && (
            <div className="flex items-center gap-2 mt-2">
              <div className="meter flex-1">
                <span style={{ width: `${pct}%`, background: 'var(--green-dark)' }} />
              </div>
              <span className="num text-2xs text-ink-500 whitespace-nowrap">
                {fmt(value)}/{fmt(target)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="🎯" meta={`${earnedCount} / ${achievements.length || 17}`}>
        Цели
      </ScreenTitle>

      {achievements.length === 0 && <Spinner label="Загрузка целей…" />}

      {goals.length > 0 && (
        <>
          <SectionTitle>В работе</SectionTitle>
          <div className="space-y-2">
            {goals.map((a) => (
              <GoalRow key={a.id} a={a} done={false} />
            ))}
          </div>
        </>
      )}

      {trophies.length > 0 && (
        <>
          <SectionTitle>Ачивки ({trophies.length})</SectionTitle>
          <div className="space-y-2">
            {trophies.map((a) => (
              <GoalRow key={a.id} a={a} done />
            ))}
          </div>
        </>
      )}

      <p className="subtle">
        Цели платят монетами <span aria-hidden="true">🪙</span> — их курс не сгорает при «новой жизни».{' '}
        <ResChip tone="gold">мета-валюта</ResChip>
      </p>
    </div>
  );
};

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}к`;
  return String(Math.round(n));
}
