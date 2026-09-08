import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { xpToNext, canUnlockPerk } from '@itsim/shared';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { EmojiToken, SpriteBadge } from '../components/ui';
import { layoutForest, NODE_H, NODE_W } from './skillTreeLayout';

/**
 * Skills — ONE tree, Path of Exile style.
 *
 * No branch subsections. skills.json is a forest of connected trees (schools
 * cross-require each other: AI/ML hangs off backend Python, blockchain off
 * frontend JavaScript), so the whole thing is laid out on a single canvas and
 * shown as one map you pan and zoom. Components are packed into balanced
 * columns; node states are the same as always and read from the frame:
 * moss = learned, neutral = available, gold + target = your main skill,
 * dark + dashed connector = gated (needs its parent leveled).
 *
 * The map is a real viewport: scroll to pan (two fingers / drag), wheel or
 * the buttons to zoom, «все» to fit the whole tree back on screen.
 */

const SKILL_EMOJI: Record<string, string> = {
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
  go: '🐹',
  swift: '🐦',
  kotlin: '🟣',
  android: '🤖',
  manual_testing: '👆',
  automation_testing: '🤖',
  selenium: '🧪',
  docker: '🐳',
  linux: '🐧',
  machine_learning: '🧠',
  neural_networks: '🕸️',
  data_science: '📊',
  prompt_engineering: '💬',
  network_security: '🌐',
  pentest: '🎯',
  cryptography: '🔐',
  game_design: '🎲',
  unity: '🟪',
  godot: '👾',
  solidity: '📜',
  web3: '🧩',
  rust_solana: '🦀',
  defi: '💹',
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const SkillsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setMainSkill = useGameStore((s) => s.setMainSkill);
  const unlockPerk = useGameStore((s) => s.unlockPerk);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [perks, setPerks] = useState<PerkInfo[]>([]);

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

  if (!player) return null;

  const branchOf: Record<string, string> = {};
  for (const s of skills) branchOf[s.id] = s.branch;

  const skillLevel = (id: string) => player.skills?.[id]?.level ?? 0;
  const skillXp = (id: string) => player.skills?.[id]?.xp ?? 0;
  const nameOf = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  const unlocked = (s: SkillInfo): boolean => {
    if (!s.unlockAt) return true;
    return Object.entries(s.unlockAt).every(([parent, need]) => skillLevel(parent) >= need);
  };
  const firstGate = (s: SkillInfo): { name: string; need: number } | null => {
    if (!s.unlockAt) return null;
    for (const [parent, need] of Object.entries(s.unlockAt)) {
      if (skillLevel(parent) < need) return { name: nameOf(parent), need };
    }
    return null;
  };

  const totalLevels = Object.values(player.skills ?? {}).reduce((sum: number, s: any) => sum + (s.level ?? 0), 0);
  const mainSkill = skills.find((s) => s.id === player.mainSkillId);

  return (
    <div className="space-y-3 animate-fade-in">
      {error && (
        <div className="panel panel-note panel-note-clay cursor-pointer" onClick={clearError}>
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <PixelIcon name="warn" size={12} className="mt-0.5" />
            {error}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <SpriteBadge sprite="bookshelf" size={32} />
          Дерево навыков
        </h2>
        <span className="num text-xs text-ink-500">{totalLevels} уровней</span>
      </div>

      {/* Main skill — the one school/work actually levels */}
      {mainSkill && (
        <div className="panel panel-note panel-note-gold flex items-center gap-2.5 !py-2">
          <PixelIcon name="target" size={15} className="text-gold-300 shrink-0" />
          <p className="flex-1 min-w-0 text-sm text-ink-200">
            Качаешь <span className="font-semibold text-white">{mainSkill.name}</span> ·{' '}
            <span className="num font-semibold text-gold-200">ур. {skillLevel(mainSkill.id)}</span>
            <span className="block text-2xs text-ink-500">тап по любой доступной ноде — сменить</span>
          </p>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="panel text-center py-8">
          <PixelIcon name="book" size={26} className="text-ink-600 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">Растим дерево…</p>
        </div>
      ) : (
        <SkillMap
          skills={skills}
          skillLevel={skillLevel}
          skillXp={skillXp}
          unlocked={unlocked}
          firstGate={firstGate}
          mainSkillId={player.mainSkillId}
          onPick={(id) => {
            haptic('selection');
            setMainSkill(id);
          }}
        />
      )}

      {/* Legend — one line, never a subsection */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-500 px-0.5">
        <span className="uppercase tracking-[0.08em] text-ink-600 font-bold">Ноды:</span>
        <LegendDot color="var(--moss)">выучен</LegendDot>
        <LegendDot color="var(--gold)">основной</LegendDot>
        <LegendDot color="var(--line-strong)">доступен</LegendDot>
        <LegendDot color="var(--line)" dashed>
          заперт
        </LegendDot>
      </div>

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
                className={`flex items-center gap-2 p-2 border ${
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
                  <p className="text-2xs text-ink-600 mt-0.5">Требует: {describeRequires(perk.requires, skills)}</p>
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

const LegendDot: React.FC<{ color: string; dashed?: boolean; children: React.ReactNode }> = ({
  color,
  dashed,
  children,
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      className="w-3 h-3 inline-block bg-ink-900"
      style={{ border: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
    />
    {children}
  </span>
);

/* ── The one big tree (pan + zoom viewport) ─────────────────────────────── */

interface SkillMapProps {
  skills: SkillInfo[];
  skillLevel: (id: string) => number;
  skillXp: (id: string) => number;
  unlocked: (s: SkillInfo) => boolean;
  firstGate: (s: SkillInfo) => { name: string; need: number } | null;
  mainSkillId: string | null | undefined;
  onPick: (id: string) => void;
}

const MIN_SCALE = 0.18;
const MAX_SCALE = 3;

const SkillMap: React.FC<SkillMapProps> = ({
  skills,
  skillLevel,
  skillXp,
  unlocked,
  firstGate,
  mainSkillId,
  onPick,
}) => {
  const forest = useMemo(() => layoutForest(skills, 2), [skills]);

  const [mapH, setMapH] = useState(420);
  const [scale, setScale] = useState(0.5);
  const scaleRef = useRef(0.5);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef(false);
  const anchorRef = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const applyScale = useCallback((next: number, anchor?: { cx: number; cy: number; px: number; py: number } | null) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    anchorRef.current = anchor ?? null;
    scaleRef.current = clamped;
    setScale(clamped);
  }, []);

  // keeps the spot under the cursor/center pinned while zooming
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    const maxL = Math.max(0, forest.width * scale - el.clientWidth);
    const maxT = Math.max(0, forest.height * scale - el.clientHeight);
    el.scrollLeft = clamp(a.cx * scale - a.px, 0, maxL);
    el.scrollTop = clamp(a.cy * scale - a.py, 0, maxT);
    anchorRef.current = null;
  }, [scale, forest.width, forest.height]);

  // fit the whole tree onto the screen (first open and the ⌂ button)
  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const s = clamp(
      Math.min((el.clientWidth - 20) / forest.width, (el.clientHeight - 20) / forest.height),
      MIN_SCALE,
      1
    );
    applyScale(s, { cx: forest.width / 2, cy: forest.height / 2, px: el.clientWidth / 2, py: el.clientHeight / 2 });
  }, [forest, applyScale]);

  // measure the tab viewport: the map claims everything above the fold
  useLayoutEffect(() => {
    const measure = () => {
      const sc = document.getElementById('game-scroll');
      if (!sc) return;
      const wrap = mapWrapRef.current;
      if (!wrap) return;
      // height of the map area = what is left of the scroll viewport above it
      const top = wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      setMapH(Math.max(280, sc.clientHeight - top - 16));
    };
    measure();
    const id = window.setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [forest]);

  // first fit after sizing is stable
  useLayoutEffect(() => {
    if (fittedRef.current || !scrollRef.current) return;
    const id = window.setTimeout(() => {
      fittedRef.current = true;
      fit();
    }, 80);
    return () => window.clearTimeout(id);
  }, [mapH, fit]);

  const zoomBy = (f: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const a = {
      cx: (el.scrollLeft + el.clientWidth / 2) / scaleRef.current,
      cy: (el.scrollTop + el.clientHeight / 2) / scaleRef.current,
      px: el.clientWidth / 2,
      py: el.clientHeight / 2,
    };
    applyScale(scaleRef.current * f, a);
  };

  // wheel = zoom (desktop / trackpads)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const f = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      const next = clamp(scaleRef.current * f, MIN_SCALE, MAX_SCALE);
      applyScale(next, {
        cx: (el.scrollLeft + px) / scaleRef.current,
        cy: (el.scrollTop + py) / scaleRef.current,
        px,
        py,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [forest, applyScale]);

  const small = scale < 0.62;

  return (
    <div ref={mapWrapRef} className="relative border-2 border-ink-700 bg-ink-900" style={{ height: mapH }}>
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto [scrollbar-width:thin] touch-pan-x touch-pan-y cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return;
          const el = scrollRef.current;
          if (!el) return;
          dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          const el = scrollRef.current;
          if (!d || !el || e.pointerType !== 'mouse') return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true;
          if (d.moved) {
            el.scrollLeft = d.sl - dx;
            el.scrollTop = d.st - dy;
          }
        }}
        onPointerUp={() => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d && d.moved) {
            suppressClickRef.current = true;
            window.setTimeout(() => (suppressClickRef.current = false), 120);
          }
        }}
      >
        {/* spacer sized in zoomed pixels so the scrollbars know the map's size */}
        <div style={{ width: forest.width * scale, height: forest.height * scale }} />
        {/* the map itself at natural size, scaled as one picture */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: forest.width,
            height: forest.height,
            transform: `scale(${scale})`,
          }}
        >
          <svg width={forest.width} height={forest.height} className="absolute inset-0" aria-hidden="true">
            {forest.clusters.map((c, ci) =>
              c.layout.edges.map((e, i) => {
                const childSkill = c.skills.find((s) => s.id === e.childId);
                const childLvl = childSkill ? skillLevel(childSkill.id) : 0;
                const isLocked = childSkill ? !unlocked(childSkill) : false;
                const midY = e.y1 + (e.y2 - e.y1) / 2;
                return (
                  <path
                    key={`${ci}-${i}`}
                    d={`M ${e.x1 + c.ox} ${e.y1 + c.oy} L ${e.x1 + c.ox} ${midY + c.oy} L ${e.x2 + c.ox} ${midY + c.oy} L ${e.x2 + c.ox} ${e.y2 + c.oy}`}
                    stroke={childLvl > 0 ? 'var(--moss)' : isLocked ? 'var(--line)' : 'var(--line-strong)'}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={isLocked ? '4 4' : undefined}
                    opacity={childLvl > 0 ? 0.9 : isLocked ? 0.5 : 0.7}
                  />
                );
              })
            )}
          </svg>

          {forest.clusters.map((c, ci) =>
            c.layout.nodes.map(({ skill, x, y }) => {
              const level = skillLevel(skill.id);
              const isMain = mainSkillId === skill.id;
              const isUnlocked = unlocked(skill);
              const isLearned = level > 0;
              const xp = skillXp(skill.id);
              const xpPercent = Math.min(100, Math.round((xp / Math.max(1, xpToNext(level))) * 100));
              const gate = isUnlocked ? null : firstGate(skill);
              const nx = x + c.ox;
              const ny = y + c.oy;

              const frame = isMain
                ? 'border-gold-700 bg-gold-900/15'
                : isLearned
                  ? 'border-moss-700 bg-moss-900/20'
                  : isUnlocked
                    ? 'border-ink-600 bg-ink-900'
                    : 'border-ink-700 bg-ink-900/60';

              return (
                <button
                  key={`${ci}-${skill.id}`}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (isUnlocked) onPick(skill.id);
                  }}
                  disabled={!isUnlocked}
                  title={
                    isMain
                      ? `Основной навык — учёба и работа качают его (ур. ${level})`
                      : !isUnlocked && gate
                        ? `${skill.flavor} Нужно: ${gate.name} ${gate.need}+`
                        : `Сделать основным: ${skill.name}`
                  }
                  className={`absolute -translate-x-1/2 flex flex-col items-center justify-center border-2 text-center transition-transform active:translate-y-[1px] ${
                    isUnlocked && !isMain ? 'hover:border-ink-400' : ''
                  } ${isUnlocked ? '' : 'opacity-75'} ${frame}`}
                  style={{ left: nx, top: ny, width: NODE_W, height: NODE_H }}
                >
                  <span className="relative">
                    <EmojiToken className="!w-7 !h-7 !text-[14px]">{SKILL_EMOJI[skill.id] ?? '📌'}</EmojiToken>
                    {isMain && (
                      <span className="absolute -top-1 -right-1 bg-ink-900 border border-gold-700 p-[1px]">
                        <PixelIcon name="target" size={8} className="text-gold-300" />
                      </span>
                    )}
                  </span>

                  {!small && (
                    <>
                      <span
                        className={`w-full px-1 mt-1 text-[10px] leading-[1.15] font-semibold truncate ${
                          isMain
                            ? 'text-gold-200'
                            : isLearned
                              ? 'text-ink-100'
                              : isUnlocked
                                ? 'text-ink-300'
                                : 'text-ink-500'
                        }`}
                        title={skill.name}
                      >
                        {skill.name}
                      </span>
                      <span className="w-full h-[16px] px-1.5 mt-0.5 flex items-center gap-1">
                        {isLearned ? (
                          <>
                            <span className="meter flex-1 !h-[3px]">
                              <span style={{ width: `${xpPercent}%`, background: 'var(--sky)' }} />
                            </span>
                            <span
                              className={`num text-[10px] font-bold leading-none ${
                                isMain ? 'text-gold-200' : 'text-moss-300'
                              }`}
                            >
                              {level}
                            </span>
                          </>
                        ) : !isUnlocked && gate ? (
                          <span
                            className="flex items-center gap-1 min-w-0 w-full justify-center text-[9px] text-ink-400"
                            title={`Нужно: ${gate.name} ${gate.need}+`}
                          >
                            <PixelIcon name="lock" size={7} className="shrink-0 text-ink-500" />
                            <span className="truncate">
                              {gate.name} {gate.need}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <MapBtn title="Отдалить" onClick={() => zoomBy(1 / 1.4)} label="−" />
        <MapBtn title="Приблизить" onClick={() => zoomBy(1.4)} label="+" />
        <MapBtn title="Показать всё дерево" onClick={fit} label="⌂" />
      </div>

      <div className="absolute bottom-1.5 left-2 right-2 z-10 flex items-end justify-between gap-2 pointer-events-none">
        <p className="text-2xs text-ink-600 leading-tight">одно дерево всех школ · тяни, чтобы смотреть</p>
        <span className="num text-2xs text-ink-600 shrink-0">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
};

const MapBtn: React.FC<{ title: string; onClick: () => void; label: string }> = ({ title, onClick, label }) => (
  <button
    title={title}
    aria-label={title}
    onClick={onClick}
    className="btn btn-secondary !min-h-[30px] !min-w-[30px] !px-0 !py-0 text-sm leading-none flex items-center justify-center select-none"
  >
    {label}
  </button>
);

const SOFT_REQUIRE_NAMES: Record<string, string> = {
  communication: 'Коммуникация',
  english: 'Английский',
  time_management: 'Тайм-менеджмент',
  leadership: 'Лидерство',
  stress_resistance: 'Стрессоустойчивость',
  public_speaking: 'Выступления',
};

const BRANCH_META: Record<string, { name: string; icon: string }> = {
  frontend: { name: 'Frontend', icon: '🎨' },
  backend: { name: 'Backend', icon: '⚙️' },
  mobile: { name: 'Mobile', icon: '📱' },
  qa: { name: 'QA', icon: '🔍' },
  devops: { name: 'DevOps', icon: '🐳' },
  ai_ml: { name: 'AI / ML', icon: '🤖' },
  cybersec: { name: 'Кибербез', icon: '🛡️' },
  gamedev: { name: 'GameDev', icon: '🎮' },
  blockchain: { name: 'Blockchain', icon: '⛓️' },
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
