import React from 'react';
import { useGameStore } from '../store/gameStore';

const SKILL_BRANCHES = [
  {
    id: 'frontend',
    name: 'Frontend',
    icon: '🎨',
    skills: ['javascript', 'react', 'nextjs', 'css', 'typescript'],
    color: 'border-sky-500',
  },
  {
    id: 'backend',
    name: 'Backend',
    icon: '⚙️',
    skills: ['python', 'java', 'spring', 'sql', 'nodejs', 'git'],
    color: 'border-emerald-500',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    icon: '📱',
    skills: ['swift', 'kotlin', 'android'],
    color: 'border-purple-500',
  },
  {
    id: 'qa',
    name: 'QA',
    icon: '🔍',
    skills: ['manual_testing', 'automation_testing', 'selenium'],
    color: 'border-amber-500',
  },
  {
    id: 'devops',
    name: 'DevOps',
    icon: '🐳',
    skills: ['docker', 'linux'],
    color: 'border-red-500',
  },
];

const SKILL_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  react: 'React',
  nextjs: 'Next.js',
  css: 'CSS',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  spring: 'Spring',
  sql: 'SQL',
  nodejs: 'Node.js',
  git: 'Git',
  swift: 'Swift',
  kotlin: 'Kotlin',
  android: 'Android SDK',
  manual_testing: 'Manual Testing',
  automation_testing: 'Automation Testing',
  selenium: 'Selenium',
  docker: 'Docker',
  linux: 'Linux',
};

const SKILL_ICONS: Record<string, string> = {
  javascript: '🟨',
  react: '⚛️',
  nextjs: '▲',
  css: '🎨',
  typescript: '🔷',
  python: '🐍',
  java: '☕',
  spring: '🌱',
  sql: '🗃️',
  nodejs: '🟢',
  git: '🔀',
  swift: '🐦',
  kotlin: '🟣',
  android: '🤖',
  manual_testing: '👆',
  automation_testing: '🤖',
  selenium: '🧪',
  docker: '🐳',
  linux: '🐧',
};

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);

  if (!player) return null;

  const getSkillLevel = (id: string) => {
    const skill = player.skills?.[id];
    const level = skill?.level ?? 0;
    const xp = skill?.xp ?? 0;
    return { level, xp };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold text-white">📚 Навыки</h2>

      {/* Soft skills */}
      <div className="game-card">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Soft Skills</h3>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(player.softSkills ?? {}).map(([id, skill]: [string, any]) => (
            <div key={id} className="text-center p-2 bg-slate-800 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">{getSoftSkillName(id)}</div>
              <div className="text-lg font-bold text-primary-400">{skill.level ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hard skills by branch */}
      {SKILL_BRANCHES.map((branch) => {
        const hasSkills = branch.skills.some((s) => player.skills?.[s]);
        if (!hasSkills) return null;

        return (
          <div key={branch.id} className={`game-card border-l-4 ${branch.color}`}>
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              {branch.icon} {branch.name}
            </h3>
            <div className="space-y-2">
              {branch.skills.map((skillId) => {
                const { level, xp } = getSkillLevel(skillId);
                if (level === 0 && !player.skills?.[skillId]) return null;
                return (
                  <div key={skillId} className="flex items-center gap-2">
                    <span className="text-sm">{SKILL_ICONS[skillId]}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300">{SKILL_NAMES[skillId]}</span>
                        <span className="text-primary-400">{level}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${Math.min(100, (level / 100) * 100)}%` }}
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

      {Object.keys(player.skills ?? {}).length === 0 && (
        <div className="game-card text-center py-8">
          <div className="text-3xl mb-2">📚</div>
          <p className="text-slate-400 text-sm">Навыков пока нет</p>
          <p className="text-slate-500 text-xs mt-1">Начни учиться в разделе «День»</p>
        </div>
      )}
    </div>
  );
};

function getSoftSkillName(id: string): string {
  const names: Record<string, string> = {
    communication: '🗣️ Комм.',
    english: '🇬🇧 Англ.',
    time_management: '📊 Тайм-мен.',
    leadership: '👑 Лид.',
    stress_resistance: '🧘 Стресс.',
    public_speaking: '🎤 Выступ.',
  };
  return names[id] ?? id;
}