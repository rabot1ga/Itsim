import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { xpToNext, canUnlockPerk } from '@itsim/shared';

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

interface PerkInfo {
  id: string;
  name: string;
  requires: Record<string, number>;
  effects: Record<string, number>;
  flavor: string;
}

const PERK_EMOJI: Record<string, string> = {
  perk_fullstack: '⚔️',
  perk_morning_person: '🌅',
  perk_speed_reader: '📖',
  perk_stoic: '🗿',
  perk_networker: '🤝',
  perk_pro_gamer: '🎮',
  perk_gold_rush: '🪙',
  perk_hustler: '🧳',
};

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setMainSkill = useGameStore((s) => s.setMainSkill);
  const unlockPerk = useGameStore((s) => s.unlockPerk);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [perks, setPerks] = useState<PerkInfo[]>([]);
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({});
  const [branchesSeeded, setBranchesSeeded] = useState(false);

  useEffect(() => {
    fetch('/api/content/skills')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
    fetch('/api/content/perks')
      .then((r) => r.json())
      .then((data) => setPerks(data.perks ?? []))
      .catch(() => setPerks([]));
  }, []);

  // Branch accordions: open what the player already touches (main skill branch
  // + branches with progress), keep the rest collapsed to kill the endless scroll.
  const mainSkillId = player?.mainSkillId;
  useEffect(() => {
    if (branchesSeeded || skills.length === 0 || !player) return;
    setBranchesSeeded(true);
    const next: Record<string, boolean> = {};
    for (const branchId of [...new Set(skills.map((s) => s.branch))]) {
      const inBranch = skills.filter((s) => s.branch === branchId);
      const hasProgress = inBranch.some((s) => (player.skills?.[s.id]?.level ?? 0) > 0);
      const hasMain = inBranch.some((s) => s.id === mainSkillId);
      next[branchId] = hasProgress || hasMain;
    }
    if (!Object.values(next).some(Boolean)) next[skills[0].branch] = true;
    setOpenBranches(next);
  }, [skills, branchesSeeded, player, mainSkillId]);

  if (!player) return null;

  const toggleBranch = (branchId: string) => {
    haptic('selection');
    setOpenBranches((prev) => ({ ...prev, [branchId]: !(prev[branchId] ?? false) }));
  };

  const branchOf: Record<string, string> = {};
  for (const s of skills) branchOf[s.id] = s.branch;

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
      {error && (
        <div className="game-card border-red-500/40 bg-red-500/10 cursor-pointer" onClick={clearError}>
          <p className="text-sm text-red-300">⚠️ {error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">📚 Навыки</h2>
        <span className="text-xs text-slate-400">Σ {totalLevels} уровней</span>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Тапни по навыку, чтобы сделать его основным — учёба и работа качают именно его 🎯
      </p>

      {/* Pinned main skill — always one tap away */}
      {(() => {
        const main = skills.find((s) => s.id === player.mainSkillId);
        if (!main) return null;
        return (
          <button
            onClick={() => toggleBranch(main.branch)}
            className="game-card !py-2.5 w-full flex items-center gap-2.5 text-left border-primary-500/30 active:scale-[0.98] transition-all"
          >
            <span className="text-xl">🎯</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Основной навык</p>
              <p className="text-sm font-medium text-slate-100 truncate">
                {SKILL_EMOJI[main.id] ?? '📌'} {main.name} · ур. {skillLevel(main.id)}
              </p>
            </div>
            <span className="text-[11px] text-primary-400 shrink-0">к ветке →</span>
          </button>
        );
      })()}

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

        const open = openBranches[branchId] ?? false;
        const progress = branchSkills.length ? learned.length / branchSkills.length : 0;

        return (
          <div key={branchId} className={`game-card !p-0 overflow-hidden border-l-4 ${meta.color}`}>
            <button
              onClick={() => toggleBranch(branchId)}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left touch-target active:bg-slate-800/40 transition-colors"
            >
              <span className="text-lg">{meta.icon}</span>
              <span className="flex-1 min-w-0 text-sm font-semibold text-slate-200 truncate">
                {meta.name}
                <span className="text-slate-500 font-normal ml-1.5 text-xs">
                  {learned.length}/{branchSkills.length}
                </span>
              </span>
              <span className="w-14 h-1.5 bg-slate-700/70 rounded-full overflow-hidden shrink-0">
                <span
                  className="block h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </span>
              <span className={`accordion-chevron text-slate-500 text-xs ${open ? 'open' : ''}`}>▾</span>
            </button>
            <div className={`accordion-body ${open ? 'open' : ''}`}>
              <div className="accordion-inner">
                <div className="px-2 pb-2.5 space-y-1">
              {branchSkills.map((s) => {
                const level = skillLevel(s.id);
                const xp = skillXp(s.id);
                const isUnlocked = unlocked(s);
                const xpPercent = Math.min(100, Math.round((xp / xpToNext(level)) * 100));
                const lockedBy = s.unlockAt
                  ? Object.entries(s.unlockAt).find(([p, need]) => skillLevel(p) < need)
                  : undefined;

                const isMain = player.mainSkillId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => isUnlocked && setMainSkill(s.id)}
                    disabled={!isUnlocked}
                    title={isUnlocked ? (isMain ? 'Основной навык' : 'Сделать основным') : s.flavor}
                    className={`w-full flex items-center gap-2 text-left rounded-lg px-2 py-2 min-h-[48px] transition-colors ${
                      isMain ? 'bg-primary-600/10 border border-primary-500/30' : 'hover:bg-slate-800/60'
                    } ${!isUnlocked ? 'opacity-50' : ''}`}
                  >
                    <span className="text-sm">{SKILL_EMOJI[s.id] ?? '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 truncate">
                          {s.name} {isMain && <span className="text-primary-400">🎯</span>}{' '}
                          {!isUnlocked && lockedBy ? `🔒 нужен ${lockedBy[0]} ${lockedBy[1]}+` : ''}
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
                  </button>
                );
              })}
                </div>
              </div>
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

      {/* Perks */}
      <div className="game-card">
        <h3 className="section-title mb-2">✨ Перки</h3>
        <div className="space-y-2">
          {perks.map((perk) => {
            const owned = (player.perks ?? []).includes(perk.id);
            const canUnlock = !owned && canUnlockPerk(player, perk.requires, branchOf);
            return (
              <div
                key={perk.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  owned
                    ? 'border-emerald-500/40 bg-emerald-900/20'
                    : canUnlock
                    ? 'border-amber-500/40 bg-amber-900/10'
                    : 'border-slate-700/60 bg-slate-800/40'
                }`}
              >
                <span className="text-lg">{PERK_EMOJI[perk.id] ?? '✨'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{perk.name}</span>
                    {owned && <span className="chip bg-emerald-900/60 text-emerald-300">открыт</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5" title={perk.flavor}>
                    {perk.flavor}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    Требует: {describeRequires(perk.requires, skills)}
                  </p>
                </div>
                {!owned && (
                  <button
                    onClick={() => unlockPerk(perk.id)}
                    disabled={!canUnlock}
                    className={`text-xs px-3 py-2 rounded-lg shrink-0 touch-target font-medium ${
                      canUnlock
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Открыть
                  </button>
                )}
              </div>
            );
          })}
          {perks.length === 0 && <p className="text-xs text-slate-500">Загрузка перков...</p>}
        </div>
      </div>
    </div>
  );
};

const SOFT_REQUIRE_NAMES: Record<string, string> = {
  communication: 'Коммуникация',
  english: 'Английский',
  time_management: 'Тайм-менеджмент',
  leadership: 'Лидерство',
  stress_resistance: 'Стрессоустойчивость',
  public_speaking: 'Выступления',
};

function describeRequires(requires: Record<string, number>, skills: SkillInfo[]): string {
  return Object.entries(requires)
    .map(([key, lvl]) => {
      if (key.endsWith('Branch')) {
        const branch = key.replace('Branch', '');
        return `${BRANCH_META[branch]?.name ?? branch}: ${lvl}`;
      }
      if (SOFT_REQUIRE_NAMES[key]) return `${SOFT_REQUIRE_NAMES[key]}: ${lvl}`;
      return `${skills.find((s) => s.id === key)?.name ?? key}: ${lvl}`;
    })
    .join(', ');
}
