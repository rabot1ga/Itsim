import { t } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { canUnlockPerk, archetypeToView, type ArchetypeDef } from '@itsim/shared';
import { ScreenTitle, SectionTitle, Spinner, ResChip, accordionBodyRef } from '../components/ui';
import { ActionGrid, toTile } from '../components/ActionGrid';
import { STUDY_ACTIONS } from './actionCatalogue';
import { SkillList, BRANCH_META, type SkillInfo } from './SkillList';
import { PixelIcon } from '../components/pixel/PixelIcon';
/**
 * «Развитие» — a flat, readable catalogue (таб A2; бывшее «Обучение»).
 *
 * The skill forest used to be drawn as a Path-of-Exile constellation. It was
 * beautiful and unusable on a 480px phone: players panned around looking for
 * a node instead of learning anything. The reference is right — a list grouped
 * by school, with progress bars and explicit locks, fits all 34 skills without
 * a tutorial. The routes ("archetypes"), soft skills and perks stay, because
 * they are progression, not navigation.
 *
 * Two halves, one switch: «Действия» is what you spend the day on, «Направления»
 * is what that day goes into. Mixing them made the screen a scroll of unrelated
 * decisions — choosing a course and choosing a career branch are not the same
 * kind of choice.
 */
interface SoftSkillMeta {
  key: string;
  name: string;
  icon: string;
}
const SOFT_SKILLS: SoftSkillMeta[] = [
  { key: 'communication', name: t('Коммуникация'), icon: 'people' },
  { key: 'english', name: t('Английский'), icon: 'globe' },
  { key: 'time_management', name: t('Тайм-менеджмент'), icon: 'calendar' },
  { key: 'leadership', name: t('Лидерство'), icon: 'trophy' },
  { key: 'stress_resistance', name: t('Стрессоустойчивость'), icon: 'heart' },
  { key: 'public_speaking', name: t('Выступления'), icon: 'play' },
];
interface PerkInfo {
  id: string;
  name: string;
  requires: Record<string, number>;
  effects: Record<string, number>;
  flavor: string;
}
const PERK_ICON: Record<string, string> = {
  perk_fullstack: 'code',
  perk_morning_person: 'bulb',
  perk_speed_reader: 'book',
  perk_stoic: 'heart',
  perk_networker: 'people',
  perk_pro_gamer: 'gamepad',
  perk_gold_rush: 'coin',
  perk_hustler: 'briefcase',
};
const ARCH_ICON: Record<string, string> = {
  frontend: 'code',
  backend: 'chip',
  ml: 'rocket',
  mobile: 'laptop',
  qa: 'check',
  web3: 'box',
};
const SOFT_REQUIRE_NAMES: Record<string, string> = {
  communication: t('Коммуникация'),
  english: t('Английский'),
  time_management: t('Тайм-менеджмент'),
  leadership: t('Лидерство'),
  stress_resistance: t('Стрессоустойчивость'),
  public_speaking: t('Выступления'),
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
/**
 * C (аудит 28.10): мета-системы не вываливаются на новичка. Блок свёрнут,
 * пока в нём нет релевантного прогресса; заголовок несёт бейдж доступного.
 */
const Fold: React.FC<{
  title: string;
  hint: string;
  defaultOpen: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, hint, defaultOpen, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left touch-target"
      >
        <SectionTitle className="flex-1 !mb-0">{title}</SectionTitle>
        {badge}
        <span aria-hidden="true" className={`accordion-chevron shrink-0 ${open ? 'is-open' : ''}`}>
          ▾
        </span>
      </button>
      {!open && <p className="text-2xs text-ink-600 mt-1">{hint}</p>}
      <div className={`accordion-body ${open ? 'open' : ''}`} ref={accordionBodyRef(open)}>
        <div className="accordion-inner">{children}</div>
      </div>
    </section>
  );
};

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
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
  const [mode, setMode] = useState<'actions' | 'tracks'>('actions');
  const [studying, setStudying] = useState(false);
  const performAction = useGameStore((s) => s.performAction);
  const pickLock = useRef(false);
  const study = async (id: string) => {
    if (studying) return;
    setStudying(true);
    try {
      await performAction(id, { skillId: player?.mainSkillId || 'javascript' });
    } finally {
      setStudying(false);
    }
  };
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
  for (const [id, v] of Object.entries(player.skills ?? {}))
    levelMap[id] =
      (
        v as {
          level?: number;
        }
      )?.level ?? 0;
  const bonuses = player.archetypeBonuses ?? [];
  const chosenArch = archDefs.find((a) => a.id === player.archetypeChosen) ?? null;
  const archViews = archDefs.map((def) => archetypeToView(def, levelMap, bonuses, nameOf));
  const route = chosenArch
    ? { title: chosenArch.title, steps: chosenArch.nodes.map((n) => ({ skillId: n.skillId, target: n.level })) }
    : null;
  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle icon="book" meta={t('{totalLevels} уровней', { totalLevels: totalLevels })}>
        {t('Развитие')}
      </ScreenTitle>

      {error && (
        <div role="alert" className="card panel-note panel-note-clay">
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <PixelIcon name="warn" size={14} />
            {error}
          </p>
          <button className="btn btn-ghost btn-sm mt-2" onClick={clearError}>
            {t('Скрыть ошибку')}
          </button>
        </div>
      )}

      {/* Which skill every study action pumps — the anchor for both halves */}
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[150px]">
          <p className="text-sm text-ink-300">
            {t('Качаем:')} <span className="font-semibold text-white">{mainSkill?.name ?? t('навык не выбран')}</span>
          </p>
          <p className="subtle mt-1">
            {mainSkill
              ? t('Учебные действия ниже дают опыт именно ему. Смени навык во вкладке «Направления».')
              : t('Открой «Направления» и тапни навык — учёба пойдёт в него.')}
          </p>
        </div>
        {mainSkill && (
          <span className="chip chip-gold shrink-0">
            {t('ур.')} {player.skills?.[mainSkill.id]?.level ?? 0}
          </span>
        )}
      </section>

      <div className="segmented" role="tablist" aria-label={t('Режим обучения')}>
        <button role="tab" aria-selected={mode === 'actions'} onClick={() => setMode('actions')}>
          {t('Действия')}
        </button>
        <button role="tab" aria-selected={mode === 'tracks'} onClick={() => setMode('tracks')}>
          {t('Направления')}
        </button>
      </div>

      {mode === 'actions' && (
        <>
          <section aria-label={t('Учебные действия')}>
            <ActionGrid
              label={t('Учебные действия')}
              actions={STUDY_ACTIONS.map((a) => toTile(a, Boolean(player.job)))}
              energy={player.energy ?? 0}
              money={player.money ?? 0}
              busy={studying}
              onRun={study}
            />
            <p className="text-2xs text-ink-600 mt-1.5">
              {t('Дороже курс — быстрее опыт. «Английский» качает гибкий навык, а не основной.')}
            </p>
          </section>

          {/* Soft skills belong to the doing half: they grow from actions */}
          <section className="card">
            <SectionTitle>{t('Гибкие навыки')}</SectionTitle>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {SOFT_SKILLS.map((s) => {
                const lvl = player.softSkills?.[s.key]?.level ?? 0;
                return (
                  <div key={s.key} className="well text-center px-2 py-2.5">
                    <div className="text-base leading-none mb-1" aria-hidden="true">
                      <PixelIcon name={s.icon} size={16} />
                    </div>
                    <div className="text-2xs text-ink-500 mb-1 leading-tight">{s.name}</div>
                    <div className="num text-base font-bold text-ink-100">{lvl}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {mode === 'tracks' && (
        <>
          {!loaded && <Spinner label={t('Загружаем навыки…')} />}

          {loadError && (
            <div className="card" role="alert">
              <p className="text-sm text-clay-300">{t('Не удалось загрузить обучение.')}</p>
              <button className="btn btn-secondary w-full mt-3" onClick={() => setAttempt((n) => n + 1)}>
                {t('Повторить загрузку')}
              </button>
            </div>
          )}

          {loaded && !loadError && skills.length === 0 && (
            <p className="card subtle">{t('Каталог навыков пока пуст.')}</p>
          )}

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
          <Fold
            title={t('Пути-архетипы')}
            hint={t('Готовые маршруты развития — загляни, когда определишься с направлением')}
            defaultOpen={Boolean(chosenArch) || (player.grade && player.grade !== 'unemployed' && player.grade !== 'intern')}
          >
            {archViews.length === 0 ? (
              <p className="subtle mt-2">
                {!loaded
                  ? t('Загрузка путей…')
                  : loadError
                    ? t('Пути недоступны — повтори загрузку выше.')
                    : t('Пути пока не опубликованы.')}
              </p>
            ) : (
              <div className="grid gap-2 mt-3 grid-cols-[minmax(0,1fr)]">
                {/* grid-cols-[minmax(0,1fr)] обязателен: у implicit-колонки размер
                    auto, и одна несжимаемая строка («дальше: …» + кнопка) растягивает
                    её до min-content — на 320px это +52px горизонтального скролла
                    всего экрана (сторожит packages/e2e/tests/skills-list.spec.ts). */}
                {archViews.map((v) => {
                  const chosen = chosenArch?.id === v.id;
                  const doneCount = v.steps.filter((s) => s.done).length;
                  const next = v.steps.find((s) => !s.done) ?? null;
                  return (
                    <div key={v.id} className={`tile ${chosen ? 'is-chosen' : ''}`} data-selected={chosen}>
                      <div className="flex items-center gap-2 min-w-0">
                        <PixelIcon name={ARCH_ICON[v.id] ?? 'star'} size={14} />
                        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink-100">{v.title}</span>
                        {v.claimed ? (
                          <ResChip tone="positive">{t('бонус ✓')}</ResChip>
                        ) : v.allDone ? (
                          <ResChip tone="gold">{t('готов')}</ResChip>
                        ) : chosen ? (
                          <ResChip tone="gold">{t('выбран')}</ResChip>
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
                      {/* min-w-0 на span обязателен: у flex-элемента min-width по
                            умолчанию auto, и без него truncate не работает */}
                      <div className="flex items-center gap-2 mt-2">
                        {next ? (
                          <span className="subtle truncate min-w-0">
                            {t('дальше:')} {next.skillName} {t('→ ур.')} {next.target}
                          </span>
                        ) : (
                          <span className="text-xs text-gold-300">{t('весь путь пройден')}</span>
                        )}
                        <span className="flex-1" />
                        {!v.claimed && v.allDone ? (
                          <button onClick={() => claimArchetype(v.id)} className="btn btn-primary btn-sm">
                            {t('Забрать бонус')}
                          </button>
                        ) : !v.allDone ? (
                          <button
                            onClick={() => chooseArchetype(chosen ? '' : v.id)}
                            aria-pressed={chosen}
                            className={`btn btn-sm ${chosen ? 'btn-secondary' : 'btn-ghost'}`}
                          >
                            {chosen ? t('Снять') : t('Следовать')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Fold>

          {/* Perks */}
          <Fold
            title={t('Перки')}
            hint={t('Постоянные бонусы за развитие — открываются по мере роста')}
            defaultOpen={perks.length > 0 && ((player.perks ?? []).length > 0 || perks.some((perk) => canUnlockPerk(player, perk.requires, branchOf)))}
            badge={
              perks.some((perk) => !(player.perks ?? []).includes(perk.id) && canUnlockPerk(player, perk.requires, branchOf)) ? (
                <ResChip tone="positive">{t('доступно')}</ResChip>
              ) : undefined
            }
          >
            <div className="space-y-2 mt-3">
              {perks.map((perk) => {
                const owned = (player.perks ?? []).includes(perk.id);
                const canUnlock = !owned && canUnlockPerk(player, perk.requires, branchOf);
                return (
                  <div key={perk.id} className="tile flex items-center gap-3" data-selected={owned}>
                    <PixelIcon name={PERK_ICON[perk.id] ?? 'star'} size={14} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink-100">{perk.name}</span>
                        {owned && <ResChip tone="positive">{t('открыт')}</ResChip>}
                      </div>
                      <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{perk.flavor}</p>
                      <p className="text-2xs text-ink-600 mt-0.5">
                        {t('Требует:')} {describeRequires(perk.requires, skills)}
                      </p>
                    </div>
                    {!owned && (
                      <button
                        onClick={() => unlockPerk(perk.id)}
                        disabled={!canUnlock}
                        className={`btn btn-sm shrink-0 ${canUnlock ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {t('Открыть')}
                      </button>
                    )}
                  </div>
                );
              })}
              {perks.length === 0 && <p className="subtle">{t('Загрузка перков…')}</p>}
            </div>
          </Fold>
        </>
      )}
    </div>
  );
};
