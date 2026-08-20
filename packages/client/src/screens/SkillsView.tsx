import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { xpToNext } from '@itsim/shared';

/**
 * Talent tree — rendered from content (skills.json) grouped by branch.
 * New branches (ai_ml, cybersec, gamedev, blockchain) appear automatically.
 */

const BRANCH_META: Record<string, { name: string; icon: string; color: string }> = {
  frontend: { name: 'Frontend', icon: '🎨', color: 'border-sky-500' },
  backend: { name: 'Backend', icon: '⚙️', color: 'border-emerald-500' },
  mobile: { name: 'Mobile', icon: '📱', color: 'border-purple-500' },
  qa: { name: 'QA', icon: '🔍', color: 'border-amber-500' },
  devops: { name: 'DevOps', icon: '🐳', color: 'border-red-500' },
  ai_ml: { name: 'AI / ML', icon: '🤖', color: 'border-fuchsia-500' },
  cybersec: { name: 'Кибербез', icon: '🛡️', color: 'border-rose-500' },
  gamedev: { name: 'GameDev', icon: '🎮', color: 'border-orange-500' },
  blockchain: { name: 'Blockchain', icon: '⛓️', color: 'border-yellow-500' },
};

const SKILL_EMOJI: Record<string, string> = {
  javascript: '🟨', react: '⚛️', nextjs: '▲', css: '🎨', typescript: '🔷',
  python: '🐍', java: '☕', spring: '🌱', sql: '🗃️', nodejs: '🟢', git: '🔀', go: '🐹',
  swift: '🐦', kotlin: '🟣', android: '🤖',
  manual_testing: '👆', automation_testing: '🤖', selenium: '🧪',
  docker: '🐳', linux: '🐧',
  machine_learning: '🧠', neural_networks: '🕸️', data_science: '📊', prompt_engineering: '💬',
  network_security: '🌐', pentest: '🎯', cryptography: '🔐',
  game_design: '🎲', unity: '🟪', godot: '👾',
  solidity: '📜', web3: '🧩', rust_solana: '🦀', defi: '💹',
};

interface SkillInfo {
  id: string;
  name: string;
  branch: string;
  icon: string;
  maxLevel: number;
  flavor: string;
  parent?: string;
  unlockAt?: Record<string, number>;
}

interface SoftSkillMeta {
  key: string;
  name: string;
  icon: string;
}

const SOFT_SKILLS: SoftSkillMeta[] = [
  { key: 'communication', name: 'Коммуникация', icon: '🗣️' },
  { key: 'english', name: 'Английский', icon: '🇬🇧' },
  { key: 'time_management', name: 'Тайм-менеджмент', icon: '📊' },
  { key: 'leadership', name: 'Лидерство', icon: '👑' },
  { key: 'stress_resistance', name: 'Стрессоустойчивость', icon: '🧘' },
  { key: 'public_speaking', name: 'Выступления', icon: '🎤' },
];

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  useEffect(() => {
    fetch('/api/content/skills')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  if (!player) return null;

  const skillLevel = (id: string) => player.skills?.[id]?.level ?? 0;
  const skillXp = (id: string) => player.skills?.[id]?.xp ?? 0;

  const unlocked = (s: SkillInfo): boolean => {
    if (!s.unlockAt) return true;
    return Object.entries(s.unlockAt).every(([parent, need]) => skillLevel(parent) >= need);
  };

  const branches = [...new Set(skills.map((s) => s.branch))];
  const totalLevels = Object.values(player.skills ?? {}).reduce((sum: number, s: any) => sum + (s.level ?? 0), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">📚 Навыки</h2>
        <span className="text-xs text-slate-400">Σ {totalLevels} уровней</span>
      </div>

      {/* Soft skills */}
      <div className="game-card">
        <h3 className="section-title mb-2">Soft Skills</h3>
        <div className="grid grid-cols-3 gap-2">
          {SOFT_SKILLS.map((s) => {
            const lvl = player.softSkills?.[s.key]?.level ?? 0;
            return (
              <div key={s.key} className="text-center p-2 bg-slate-800 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">{s.icon} {s.name}</div>
                <div className="text-lg font-bold text-primary-400">{lvl}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hard skills by branch (dynamic from content) */}
      {branches.map((branchId) => {
        const meta = BRANCH_META[branchId] ?? { name: branchId, icon: '📌', color: 'border-slate-500' };
        const branchSkills = skills.filter((s) => s.branch === branchId);
        const learned = branchSkills.filter((s) => skillLevel(s.id) > 0);
        if (branchSkills.length === 0) return null;

        return (
          <div key={branchId} className={`game-card border-l-4 ${meta.color}`}>
            <h3 className="section-title mb-2">
              {meta.icon} {meta.name}
              <span className="text-slate-600 ml-1">({learned.length}/{branchSkills.length})</span>
            </h3>
            <div className="space-y-2">
              {branchSkills.map((s) => {
                const level = skillLevel(s.id);
                const xp = skillXp(s.id);
                const isUnlocked = unlocked(s);
                const xpPercent = Math.min(100, Math.round((xp / xpToNext(level)) * 100));
                const lockedBy = s.unlockAt
                  ? Object.entries(s.unlockAt).find(([p, need]) => skillLevel(p) < need)
                  : undefined;

                return (
                  <div key={s.id} className={`flex items-center gap-2 ${!isUnlocked ? 'opacity-50' : ''}`}>
                    <span className="text-sm">{SKILL_EMOJI[s.id] ?? '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 truncate" title={s.flavor}>
                          {s.name} {!isUnlocked && lockedBy ? `🔒 нужен ${lockedBy[0]} ${lockedBy[1]}+` : ''}
                        </span>
                        <span className="text-primary-400">{level}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${xpPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {skills.length === 0 && (
        <div className="game-card text-center py-8">
          <div className="text-3xl mb-2">📚</div>
          <p className="text-slate-400 text-sm">Загрузка дерева навыков...</p>
        </div>
      )}
    </div>
  );
};
