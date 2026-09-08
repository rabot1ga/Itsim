import React, { useState } from 'react';
import { xpToNext } from '@itsim/shared';
import { PixelIcon } from '../components/pixel/PixelIcon';

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

const SYMBOLS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'Py',
  react: 'Re',
  nextjs: 'Nx',
  css: '#',
  sql: 'DB',
  java: 'Jv',
  nodejs: 'Nd',
  git: 'Git',
  docker: 'Dk',
};

export function missingRequirements(skill: SkillInfo, levels: SkillListProps['levels'], skills: SkillInfo[]): string[] {
  return Object.entries(skill.unlockAt ?? {})
    .filter(([id, need]) => (levels[id]?.level ?? 0) < need)
    .map(
      ([id, need]) => `${skills.find((s) => s.id === id)?.name ?? id}: ур. ${need} (сейчас ${levels[id]?.level ?? 0})`
    );
}

/** Compact alternative to the galaxy. Both views use the same server skill selection. */
export const SkillList: React.FC<SkillListProps> = ({ skills, levels, mainSkillId, busy, route, onPick }) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [branch, setBranch] = useState('all');
  const branches = [...new Set(skills.map((skill) => skill.branch))];
  const visible = skills.filter(
    (skill) =>
      (branch === 'all' || skill.branch === branch) &&
      `${skill.name} ${skill.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  return (
    <section aria-label="Список навыков" className="skill-list">
      <div className="skill-list-filters">
        <label>
          Найти навык
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="JavaScript, Python…"
          />
        </label>
        <label>
          Направление
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">Все направления</option>
            {branches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-ink-400" role="status">
        Показано {expanded ? visible.length : Math.min(8, visible.length)} из {visible.length} · всего {skills.length}
      </p>
      {visible.length === 0 && (
        <div className="panel">
          <p className="text-sm text-ink-300">Навыки не найдены. Попробуй другое название или направление.</p>
          <button
            className="btn btn-secondary mt-2"
            onClick={() => {
              setQuery('');
              setBranch('all');
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
      {(expanded ? visible : visible.slice(0, 8)).map((skill) => {
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
          <article
            key={skill.id}
            className={`skill-list-row ${main ? 'is-main' : ''} ${locked ? 'is-locked' : ''}`}
            aria-label={skill.name}
          >
            <span className="skill-list-symbol" aria-hidden="true">
              {locked ? <PixelIcon name="lock" size={20} /> : (SYMBOLS[skill.id] ?? skill.name.slice(0, 2))}
            </span>
            <div className="skill-list-copy">
              <div className="skill-list-title">
                <h3>{skill.name}</h3>
                <span className="text-xs text-ink-400">Уровень {level}</span>
              </div>
              {milestone && <p className="text-2xs text-gold-300">Веха пути · цель: ур. {milestone.target}</p>}
              <div className="skill-list-progress-label">
                <span>{maxed ? 'Максимальный уровень' : 'До следующего уровня'}</span>
                <span className="num">{maxed ? `${level} / ${skill.maxLevel}` : `${xp} / ${need} XP`}</span>
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-label={`Прогресс ${skill.name}`}
                aria-valuemin={0}
                aria-valuemax={maxed ? skill.maxLevel : need}
                aria-valuenow={maxed ? level : xp}
              >
                <span style={{ width: `${maxed ? 100 : (xp / need) * 100}%`, background: 'var(--ochre)' }} />
              </div>
              {locked && <p className="skill-list-requirements">Нужно: {requirements.join(' · ')}</p>}
              <div className="skill-list-action">
                <span className="text-2xs text-ink-400">{skill.branch}</span>
                <button
                  className={`btn ${main ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={locked || busy || main}
                  aria-pressed={main}
                  onClick={() => onPick(skill.id)}
                >
                  {main ? 'Основной навык' : locked ? 'Заблокирован' : 'Сделать основным'}
                </button>
              </div>
            </div>
          </article>
        );
      })}
      {visible.length > 8 && (
        <button className="btn btn-secondary w-full" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть список' : `Показать все ${visible.length} навыков`}
        </button>
      )}
    </section>
  );
};
