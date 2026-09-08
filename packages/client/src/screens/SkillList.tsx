import React, { useState } from 'react';
import { xpToNext } from '@itsim/shared';

export interface SkillInfo {
  id: string;
  name: string;
  branch: string;
  icon: string;
  maxLevel: number;
  flavor: string;
  parent?: string;
  unlockAt?: Record<string, number>;
}

interface SkillListProps {
  skills: SkillInfo[];
  levels: Record<string, { level: number; xp: number }>;
  mainSkillId?: string | null;
  busy: boolean;
  route?: { steps: Array<{ skillId: string; target: number }> } | null;
  onPick: (id: string) => void;
}

/** School headers — emoji + human name, in the order a career usually grows. */
export const BRANCH_META: Record<string, { name: string; emoji: string }> = {
  frontend: { name: 'Frontend', emoji: '🎨' },
  backend: { name: 'Backend', emoji: '⚙️' },
  mobile: { name: 'Mobile', emoji: '📱' },
  qa: { name: 'QA', emoji: '🔍' },
  devops: { name: 'DevOps', emoji: '🐳' },
  ai_ml: { name: 'AI / ML', emoji: '🤖' },
  cybersec: { name: 'Кибербез', emoji: '🛡️' },
  gamedev: { name: 'GameDev', emoji: '🎮' },
  blockchain: { name: 'Blockchain', emoji: '⛓️' },
};

const BRANCH_ORDER = Object.keys(BRANCH_META);

/** Two-letter monogram, the way the reference draws skill badges. */
const SYMBOLS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'Py',
  react: 'Re',
  nextjs: 'Nx',
  css: 'CSS',
  sql: 'DB',
  java: 'Jv',
  nodejs: 'Nd',
  git: 'Git',
  docker: 'Dk',
  linux: 'Lx',
};

export function missingRequirements(skill: SkillInfo, levels: SkillListProps['levels'], skills: SkillInfo[]): string[] {
  return Object.entries(skill.unlockAt ?? {})
    .filter(([id, need]) => (levels[id]?.level ?? 0) < need)
    .map(
      ([id, need]) => `${skills.find((s) => s.id === id)?.name ?? id}: ур. ${need} (сейчас ${levels[id]?.level ?? 0})`
    );
}

/**
 * Learning — a flat list grouped by school, one accordion per school.
 *
 * A radial map looked impressive and read like homework on a 480px screen.
 * A list is scanned in a second: name, level, progress bar, and a lock with
 * the exact requirement when the skill is still gated. Tapping a row makes it
 * the main skill (a gold frame marks it), which is what the study actions on
 * the home screen level up.
 */
export const SkillList: React.FC<SkillListProps> = ({ skills, levels, mainSkillId, busy, route, onPick }) => {
  const rank = (branch: string) => {
    const index = BRANCH_ORDER.indexOf(branch);
    return index === -1 ? BRANCH_ORDER.length : index;
  };
  const branches = [...new Set(skills.map((s) => s.branch))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(branches.map((b, i) => [b, i === 0]))
  );

  const toggle = (branch: string) => setOpen((prev) => ({ ...prev, [branch]: !prev[branch] }));

  return (
    <section aria-label="Список навыков">
      {branches.map((branch) => {
        const meta = BRANCH_META[branch] ?? { name: branch, emoji: '📘' };
        const items = skills.filter((s) => s.branch === branch);
        const learned = items.filter((s) => (levels[s.id]?.level ?? 0) > 0).length;
        const isOpen = open[branch] ?? false;
        return (
          <div className="skill-group" key={branch}>
            <button className="skill-group-head" aria-expanded={isOpen} onClick={() => toggle(branch)}>
              <span className="emoji" aria-hidden="true">
                {meta.emoji}
              </span>
              <span className="skill-group-name">{meta.name}</span>
              <span className="skill-group-count num">
                {learned} / {items.length}
              </span>
              <span className={`accordion-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">
                ▾
              </span>
            </button>
            <div className={`accordion-body ${isOpen ? 'open' : ''}`}>
              <div className="accordion-inner">
                <div className="skill-group-body">
                  {items.map((skill) => {
                    const state = levels[skill.id] ?? { level: 0, xp: 0 };
                    const level = Math.max(0, Math.min(skill.maxLevel, state.level));
                    const maxed = level >= skill.maxLevel;
                    const need = xpToNext(level);
                    const xp = Math.max(0, Math.min(need, state.xp));
                    const requirements = missingRequirements(skill, levels, skills);
                    const locked = requirements.length > 0;
                    const main = mainSkillId === skill.id;
                    const milestone = route?.steps.find((step) => step.skillId === skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={`skill-row ${main ? 'is-main' : ''} ${locked ? 'is-locked' : ''}`}
                        aria-label={skill.name}
                        aria-pressed={main}
                        disabled={locked || busy || main}
                        onClick={() => onPick(skill.id)}
                      >
                        <span className="skill-badge" aria-hidden="true">
                          {locked ? '🔒' : (SYMBOLS[skill.id] ?? skill.name.slice(0, 2))}
                        </span>
                        <span className="skill-row-copy">
                          <span className="skill-row-title">
                            <h3>{skill.name}</h3>
                            {main ? (
                              <span className="skill-main-mark">основной</span>
                            ) : (
                              <span className="skill-row-level num">ур. {level}</span>
                            )}
                          </span>
                          <span className="skill-row-progress">
                            <span
                              className="meter"
                              role="progressbar"
                              aria-label={`Прогресс ${skill.name}`}
                              aria-valuemin={0}
                              aria-valuemax={maxed ? skill.maxLevel : need}
                              aria-valuenow={maxed ? level : xp}
                            >
                              <span
                                style={{
                                  width: `${maxed ? 100 : (xp / need) * 100}%`,
                                  background: main ? 'var(--gold)' : 'var(--green-dark)',
                                }}
                              />
                            </span>
                            <span className="skill-row-xp num">{maxed ? 'максимум' : `${xp} / ${need} XP`}</span>
                          </span>
                          {milestone && (
                            <span className="skill-row-note">Веха пути · цель: ур. {milestone.target}</span>
                          )}
                          {locked && <span className="skill-row-note">Нужно: {requirements.join(' · ')}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
};
