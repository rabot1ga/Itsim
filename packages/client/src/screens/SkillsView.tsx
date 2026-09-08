import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { canUnlockPerk, archetypeToView, type ArchetypeDef } from '@itsim/shared';
import { EmojiToken, ScreenTitle, SectionTitle, Spinner, ResChip } from '../components/ui';
import { SkillList, BRANCH_META, type SkillInfo } from './SkillList';

/**
 * Обучение — a flat, readable catalogue.
 *
 * The skill forest used to be drawn as a Path-of-Exile constellation. It was
 * beautiful and unusable on a 480px phone: players panned around looking for
 * a node instead of learning anything. The reference is right — a list grouped
 * by school, with progress bars and explicit locks, fits all 34 skills without
 * a tutorial. The routes ("archetypes"), soft skills and perks stay, because
 * they are progression, not navigation.
 */

interface SoftSkillMeta {
  key: string;
  name: string;
  emoji: string;
}

const SOFT_SKILLS: SoftSkillMeta[] = [
  { key: 'communication', name: 'Коммуникация', emoji: '🗣️' },
  { key: 'english', name: 'Английский', emoji: '🇬🇧' },
  { key: 'time_management', name: 'Тайм-менеджмент', emoji: '📊' },
  { key: 'leadership', name: 'Лидерство', emoji: '👑' },
  { key: 'stress_resistance', name: 'Стрессоустойчивость', emoji: '🧘' },
  { key: 'public_speaking', name: 'Выступления', emoji: '🎤' },
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

const ARCH_EMOJI: Record<string, string> = {
  frontend: '🎨',
  backend: '⚙️',
  ml: '🧠',
  mobile: '📱',
  qa: '🔍',
  web3: '⛓️',
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

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const setMainSkill = useGameStore((s) => s.setMainSkill);
  const unlockPerk = useGameStore((s) => s.unlockPerk);
  const chooseArchetype = useGameStore((s) => s.chooseArchetype);
  const claimArchetype = useGameStore((s) => s.claimArchetype);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [perks, setPerks] = useState<PerkInfo[]>([]);
  const [archDefs, setArchDefs] = useState<ArchetypeDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(false);
  const pickLock = useRef(false);

  const pickSkill = async (id: string) => {
    if (pickLock.current) return;
    pickLock.current = true;
    setPicking(true);
    haptic('selection');
    try {
      await setMainSkill(id);
    } finally {
      pickLock.current = false;
      setPicking(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoadError(false);
    const load = async (path: string, key: string) => {
      const response = await fetch(`/api/content/${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(path);
      const data = await response.json();
      if (!Array.isArray(data[key])) throw new Error(path);
      return data[key];
    };
    Promise.all([load('skills', 'skills'), load('perks', 'perks'), load('archetypes', 'archetypes')])
      .then(([skillData, perkData, archetypeData]) => {
        setSkills(skillData);
        setPerks(perkData);
        setArchDefs(archetypeData);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError(true);
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  if (!player) return null;

  const branchOf: Record<string, string> = {};
  for (const s of skills) branchOf[s.id] = s.branch;

  const nameOf = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  const totalLevels = Object.values(player.skills ?? {}).reduce((sum: number, s: any) => sum + (s.level ?? 0), 0);
  const mainSkill = skills.find((s) => s.id === player.mainSkillId);

  // ── Archetype routes: progress is derived from live skill levels ──
  const levelMap: Record<string, number> = {};
  for (const [id, v] of Object.entries(player.skills ?? {})) levelMap[id] = (v as { level?: number })?.level ?? 0;
  const bonuses = player.archetypeBonuses ?? [];
  const chosenArch = archDefs.find((a) => a.id === player.archetypeChosen) ?? null;
  const archViews = archDefs.map((def) => archetypeToView(def, levelMap, bonuses, nameOf));
  const route = chosenArch
    ? { title: chosenArch.title, steps: chosenArch.nodes.map((n) => ({ skillId: n.skillId, target: n.level })) }
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="📚" meta={`${totalLevels} уровней`}>
        Обучение
      </ScreenTitle>

      {error && (
        <div role="alert" className="card panel-note panel-note-clay">
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <span aria-hidden="true">⚠️</span>
            {error}
          </p>
          <button className="btn btn-ghost btn-sm mt-2" onClick={clearError}>
            Скрыть ошибку
          </button>
        </div>
      )}

      {/* Which skill the study actions pump */}
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[150px]">
          <p className="text-sm text-ink-300">
            Основной: <span className="font-semibold text-white">{mainSkill?.name ?? 'не выбран'}</span>
          </p>
          <p className="subtle mt-1">Опыт дают учебные действия на «Главной». Тапни навык, чтобы качать его.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setView('main')}>
          Учиться
        </button>
      </section>

      {!loaded && <Spinner label="Загружаем навыки…" />}

      {loadError && (
        <div className="card" role="alert">
          <p className="text-sm text-clay-300">Не удалось загрузить обучение.</p>
          <button className="btn btn-secondary w-full mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}

      {loaded && !loadError && skills.length === 0 && <p className="card subtle">Каталог навыков пока пуст.</p>}

      {loaded && !loadError && skills.length > 0 && (
        <SkillList
          skills={skills}
          levels={player.skills ?? {}}
          mainSkillId={player.mainSkillId}
          busy={picking}
          route={route}
          onPick={pickSkill}
        />
      )}

      {/* Curated routes: pick one and the list marks its milestones */}
      <section className="card">
        <SectionTitle>Пути-архетипы</SectionTitle>
        {archViews.length === 0 ? (
          <p className="subtle mt-2">
            {!loaded
              ? 'Загрузка путей…'
              : loadError
                ? 'Пути недоступны — повтори загрузку выше.'
                : 'Пути пока не опубликованы.'}
          </p>
        ) : (
          <div className="grid gap-2 mt-3">
            {archViews.map((v) => {
              const chosen = chosenArch?.id === v.id;
              const doneCount = v.steps.filter((s) => s.done).length;
              const next = v.steps.find((s) => !s.done) ?? null;
              return (
                <div key={v.id} className={`tile ${chosen ? 'is-chosen' : ''}`} data-selected={chosen}>
                  <div className="flex items-center gap-2 min-w-0">
                    <EmojiToken>{ARCH_EMOJI[v.id] ?? '🧭'}</EmojiToken>
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink-100">{v.title}</span>
                    {v.claimed ? (
                      <ResChip tone="positive">бонус ✓</ResChip>
                    ) : v.allDone ? (
                      <ResChip tone="gold">готов</ResChip>
                    ) : chosen ? (
                      <ResChip tone="gold">выбран</ResChip>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="meter flex-1">
                      <span
                        style={{
                          width: `${v.steps.length ? (doneCount / v.steps.length) * 100 : 0}%`,
                          background: 'var(--gold)',
                        }}
                      />
                    </span>
                    <span className="num text-xs font-bold text-ink-300 shrink-0">
                      {doneCount}/{v.steps.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {next ? (
                      <span className="subtle truncate">
                        дальше: {next.skillName} → ур. {next.target}
                      </span>
                    ) : (
                      <span className="text-xs text-gold-300">весь путь пройден</span>
                    )}
                    <span className="flex-1" />
                    {!v.claimed && v.allDone ? (
                      <button onClick={() => claimArchetype(v.id)} className="btn btn-primary btn-sm">
                        Забрать бонус
                      </button>
                    ) : !v.allDone ? (
                      <button
                        onClick={() => chooseArchetype(chosen ? '' : v.id)}
                        aria-pressed={chosen}
                        className={`btn btn-sm ${chosen ? 'btn-secondary' : 'btn-ghost'}`}
                      >
                        {chosen ? 'Снять' : 'Следовать'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Soft skills */}
      <section className="card">
        <SectionTitle>Гибкие навыки</SectionTitle>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {SOFT_SKILLS.map((s) => {
            const lvl = player.softSkills?.[s.key]?.level ?? 0;
            return (
              <div key={s.key} className="well text-center px-2 py-2.5">
                <div className="text-base leading-none mb-1" aria-hidden="true">
                  {s.emoji}
                </div>
                <div className="text-2xs text-ink-500 mb-1 leading-tight">{s.name}</div>
                <div className="num text-base font-bold text-ink-100">{lvl}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Perks */}
      <section className="card">
        <SectionTitle>Перки</SectionTitle>
        <div className="space-y-2 mt-3">
          {perks.map((perk) => {
            const owned = (player.perks ?? []).includes(perk.id);
            const canUnlock = !owned && canUnlockPerk(player, perk.requires, branchOf);
            return (
              <div key={perk.id} className="tile flex items-center gap-3" data-selected={owned}>
                <EmojiToken>{PERK_EMOJI[perk.id] ?? '✨'}</EmojiToken>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-100">{perk.name}</span>
                    {owned && <ResChip tone="positive">открыт</ResChip>}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{perk.flavor}</p>
                  <p className="text-2xs text-ink-600 mt-0.5">Требует: {describeRequires(perk.requires, skills)}</p>
                </div>
                {!owned && (
                  <button
                    onClick={() => unlockPerk(perk.id)}
                    disabled={!canUnlock}
                    className={`btn btn-sm shrink-0 ${canUnlock ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Открыть
                  </button>
                )}
              </div>
            );
          })}
          {perks.length === 0 && <p className="subtle">Загрузка перков…</p>}
        </div>
      </section>
    </div>
  );
};
