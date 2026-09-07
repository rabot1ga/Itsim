import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { xpToNext, canUnlockPerk } from '@itsim/shared';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { EmojiToken } from '../components/ui';

/**
 * Talent tree — rendered from content (skills.json) grouped by branch.
 * New branches (ai_ml, cybersec, gamedev, blockchain) appear automatically.
 */

const BRANCH_META: Record<string, { name: string; icon: string; color: string }> = {
  frontend: { name: 'Frontend', icon: '🎨', color: 'border-ink-600' },
  backend: { name: 'Backend', icon: '⚙️', color: 'border-ink-600' },
  mobile: { name: 'Mobile', icon: '📱', color: 'border-ink-600' },
  qa: { name: 'QA', icon: '🔍', color: 'border-ink-600' },
  devops: { name: 'DevOps', icon: '🐳', color: 'border-ink-600' },
  ai_ml: { name: 'AI / ML', icon: '🤖', color: 'border-ink-600' },
  cybersec: { name: 'Кибербез', icon: '🛡️', color: 'border-ink-600' },
  gamedev: { name: 'GameDev', icon: '🎮', color: 'border-ink-600' },
  blockchain: { name: 'Blockchain', icon: '⛓️', color: 'border-ink-600' },
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
        <div className="panel panel-note panel-note-clay cursor-pointer" onClick={clearError}>
          <p className="flex items-start gap-2 text-sm text-clay-300"><PixelIcon name="warn" size={12} className="mt-0.5" />{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <PixelIcon name="book" size={14} className="text-gold-300" />
          Навыки
        </h2>
        <span className="num text-xs text-ink-500">{totalLevels} уровней</span>
      </div>
      <p className="text-xs text-ink-500 -mt-2 leading-relaxed">
        Тапни по навыку, чтобы сделать его основным — учёба и работа качают именно его.
      </p>

      {/* Pinned main skill — always one tap away */}
      {(() => {
        const main = skills.find((s) => s.id === player.mainSkillId);
        if (!main) return null;
        return (
          <button
            onClick={() => toggleBranch(main.branch)}
            className="tile w-full flex items-center gap-2.5 panel-note panel-note-gold"
          >
            <PixelIcon name="target" size={16} className="text-gold-300" />
            <div className="flex-1 min-w-0">
              <p className="text-2xs uppercase tracking-[0.09em] text-ink-500">Основной навык</p>
              <p className="text-sm font-medium text-white truncate">
                {main.name} · <span className="num">ур. {skillLevel(main.id)}</span>
              </p>
            </div>
            <PixelIcon name="arrow" size={11} className="text-ink-500 shrink-0" />
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
              <div key={s.key} className="well text-center px-2 py-2">
                <div className="text-2xs text-ink-500 mb-1 leading-tight">{s.name}</div>
                <div className="num text-base font-semibold text-ink-100">{lvl}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hard skills by branch (dynamic from content) */}
      {branches.map((branchId) => {
        const meta = BRANCH_META[branchId] ?? { name: branchId, icon: '📌', color: 'border-ink-500' };
        const branchSkills = skills.filter((s) => s.branch === branchId);
        const learned = branchSkills.filter((s) => skillLevel(s.id) > 0);
        if (branchSkills.length === 0) return null;

        const open = openBranches[branchId] ?? false;
        const progress = branchSkills.length ? learned.length / branchSkills.length : 0;

        return (
          <div key={branchId} className="panel !p-0 overflow-hidden">
            <button
              onClick={() => toggleBranch(branchId)}
              className="w-full flex items-center gap-2.5 px-3 py-3 text-left touch-target transition-colors hover:bg-ink-700/40"
            >
              <EmojiToken className="!w-6 !h-6 !text-[12px]">{meta.icon}</EmojiToken>
              <span className="flex-1 min-w-0 text-sm font-semibold text-ink-100 truncate">
                {meta.name}
                <span className="num text-ink-500 font-normal ml-1.5 text-xs">
                  {learned.length}/{branchSkills.length}
                </span>
              </span>
              <span className="meter w-14 shrink-0">
                <span
                  style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--moss)' }}
                />
              </span>
              <PixelIcon name="chevron" size={10} className={`accordion-chevron text-ink-500 ${open ? 'open' : ''}`} />
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
                    className={`w-full flex items-center gap-2 text-left rounded-md px-2 py-2 min-h-[46px] border transition-colors ${
                      isMain
                        ? 'border-gold-700 bg-gold-900/20'
                        : 'border-transparent hover:bg-ink-700/40'
                    } ${!isUnlocked ? 'opacity-45' : ''}`}
                  >
                    <EmojiToken className="!w-6 !h-6 !text-[12px]">
                      {SKILL_EMOJI[s.id] ?? '📌'}
                    </EmojiToken>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-ink-200 truncate flex items-center gap-1.5">
                          {s.name}
                          {isMain && <PixelIcon name="target" size={9} className="text-gold-300" />}
                          {!isUnlocked && lockedBy && (
                            <span className="flex items-center gap-1 text-ink-500">
                              <PixelIcon name="lock" size={9} />
                              <span className="num">
                                {lockedBy[0]} {lockedBy[1]}+
                              </span>
                            </span>
                          )}
                        </span>
                        <span className="num text-ink-100 font-semibold">{level}</span>
                      </div>
                      <div className="meter mt-1">
                        <span style={{ width: `${xpPercent}%`, background: 'var(--sky)' }} />
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
        <div className="panel text-center py-8">
          <PixelIcon name="book" size={26} className="text-ink-600 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">Загрузка дерева навыков…</p>
        </div>
      )}

      {/* Perks */}
      <div className="game-card">
        <h3 className="section-title mb-2">Перки</h3>
        <div className="space-y-2">
          {perks.map((perk) => {
            const owned = (player.perks ?? []).includes(perk.id);
            const canUnlock = !owned && canUnlockPerk(player, perk.requires, branchOf);
            return (
              <div
                key={perk.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  owned
                    ? 'border-moss-700 bg-moss-900/20'
                    : canUnlock
                    ? 'border-gold-700 bg-gold-900/15'
                    : 'border-ink-700 bg-ink-900'
                }`}
              >
                <EmojiToken>{PERK_EMOJI[perk.id] ?? '✨'}</EmojiToken>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{perk.name}</span>
                    {owned && <span className="chip !text-moss-300 !border-moss-700">открыт</span>}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5 leading-relaxed" title={perk.flavor}>
                    {perk.flavor}
                  </p>
                  <p className="text-2xs text-ink-600 mt-0.5">
                    Требует: {describeRequires(perk.requires, skills)}
                  </p>
                </div>
                {!owned && (
                  <button
                    onClick={() => unlockPerk(perk.id)}
                    disabled={!canUnlock}
                    className={`btn !min-h-[34px] !px-3 text-xs shrink-0 ${
                      canUnlock ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    Открыть
                  </button>
                )}
              </div>
            );
          })}
          {perks.length === 0 && <p className="text-xs text-ink-500">Загрузка перков…</p>}
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
