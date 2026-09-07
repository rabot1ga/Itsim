import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Achievements screen — all 17 achievements with earned state and
 * client-side progress bars (computed from player state + conditions).
 */

const ACHIEVEMENT_EMOJI: Record<string, string> = {
  first_offer: '🎯',
  reached_junior: '🌱',
  reached_middle: '🌗',
  reached_senior: '🥷',
  reached_teamlead: '👑',
  reached_architect: '🏛️',
  first_million: '🤑',
  skill_50: '📚',
  skill_100: '🧙',
  fullstack_samurai: '⚔️',
  survivor_100: '🏕️',
  freelance_star: '🌟',
  burnout_ending: '🔥',
  events_50: '🎲',
  networking_guru: '🤝',
  mining_100k: '⛏️',
  mining_1m: '🐳',
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
              value: Math.max(0, (player.skills?.['javascript']?.level ?? 0)) + Math.max(0, (player.skills?.['python']?.level ?? 0)),
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">🏆 Достижения</h2>
        <span className="text-xs text-slate-400">
          {earnedCount}/{achievements.length || 17}
        </span>
      </div>

      <div className="space-y-2">
        {achievements.map((a) => {
          const isEarned = earned.has(a.id);
          const { value, target } = progress(a);
          const pct = Math.max(0, Math.min(100, (value / Math.max(1, target)) * 100));

          return (
            <div
              key={a.id}
              className={`game-card !p-3 flex items-center gap-3 ${
                isEarned ? 'border-amber-500/40' : 'opacity-80'
              }`}
            >
              <span className={`text-2xl ${isEarned ? '' : 'grayscale opacity-60'}`}>
                {ACHIEVEMENT_EMOJI[a.id] ?? '🏅'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${isEarned ? 'text-amber-300' : 'text-slate-300'}`}>
                    {a.name}
                  </span>
                  {isEarned && <span className="text-[10px] text-emerald-400">✓</span>}
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">{a.description}</p>
                {!isEarned && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-500 tabular-nums whitespace-nowrap">
                      {fmt(value)}/{fmt(target)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {achievements.length === 0 && (
          <div className="game-card text-center py-8">
            <p className="text-slate-400 text-sm">Загрузка достижений...</p>
          </div>
        )}
      </div>
    </div>
  );
};

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}к`;
  return String(Math.round(n));
}
