import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { xpToNext, canUnlockPerk, archetypeToView, type ArchetypeDef } from '@itsim/shared';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { EmojiToken, SpriteBadge } from '../components/ui';
import { KEYSTONE_H, KEYSTONE_W, layoutGalaxy, NODE_H, NODE_W } from './skillTreeLayout';

/**
 * Skills — ONE map, Path of Exile style.
 *
 * No branch subsections. skills.json is a forest of connected trees (schools
 * cross-require each other: AI/ML hangs off backend Python, blockchain off
 * frontend JavaScript), so the whole thing is drawn as a single constellation
 * you pan and zoom. Every school root is the center of its own radial tree;
 * groves are scattered over the canvas (golden-angle spiral), never aligned
 * into columns or rows, and paths between a skill and its children are curved
 * Béziers that wind instead of elbows. Node states read from the frame:
 * moss = learned, neutral = available, gold + target = your main skill,
 * dark + dashed connector = gated (needs its parent leveled).
 *
 * The map is a real viewport: scroll to pan (two fingers / drag), wheel or
 * the buttons to zoom, «⌂» to fit the whole map back on screen.
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

/** One curated route through the skill galaxy (roadmap P1.3). */
const ARCH_EMOJI: Record<string, string> = {
  frontend: '🎨',
  backend: '⚙️',
  ml: '🧠',
  mobile: '📱',
  qa: '🔍',
  web3: '⛓️',
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

  useEffect(() => {
    fetch('/api/content/skills')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
    fetch('/api/content/perks')
      .then((r) => r.json())
      .then((data) => setPerks(data.perks ?? []))
      .catch(() => setPerks([]));
    fetch('/api/content/archetypes')
      .then((r) => r.json())
      .then((data) => setArchDefs(data.archetypes ?? []))
      .catch(() => setArchDefs([]));
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

  // ── Archetype routes (P1.3): progress is derived from live skill levels ──
  const levelMap: Record<string, number> = {};
  for (const [id, v] of Object.entries(player.skills ?? {})) levelMap[id] = (v as { level?: number })?.level ?? 0;
  const bonuses = player.archetypeBonuses ?? [];
  const chosenArch = archDefs.find((a) => a.id === player.archetypeChosen) ?? null;
  const archViews = archDefs.map((def) => archetypeToView(def, levelMap, bonuses, nameOf));
  const route = chosenArch
    ? {
        title: chosenArch.title,
        steps: chosenArch.nodes.map((n) => ({ skillId: n.skillId, target: n.level })),
      }
    : null;

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
          route={route}
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
        {route ? (
          <>
            <LegendDot color="var(--gold)">веха пути</LegendDot>
            <span className="text-ink-600">вне пути приглушены</span>
          </>
        ) : (
          <LegendDot color="var(--gold)">основной</LegendDot>
        )}
        <LegendDot color="var(--line-strong)">доступен</LegendDot>
        <LegendDot color="var(--line)" dashed>
          заперт
        </LegendDot>
      </div>

      {/* Archetype routes (P1.3) — curated builds; pick one to trace it on the map */}
      <div className="game-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title">Пути-архетипы</h3>
          {archViews.length > 0 && <span className="text-2xs text-ink-500">бонус — раз за жизнь</span>}
        </div>
        {archViews.length === 0 ? (
          <p className="text-xs text-ink-500">Загрузка путей…</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto snap-x pb-1 [scrollbar-width:none]">
            {archViews.map((v) => {
              const chosen = chosenArch?.id === v.id;
              const doneCount = v.steps.filter((s) => s.done).length;
              const next = v.steps.find((s) => !s.done) ?? null;
              const rewardText = [
                v.reward.money > 0 ? `₽${v.reward.money.toLocaleString('ru-RU')}` : '',
                v.reward.reputation > 0 ? `+${v.reward.reputation} реп` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={v.id}
                  className={`snap-start w-[264px] shrink-0 border-2 flex flex-col gap-1.5 p-2 ${
                    chosen ? 'border-gold-700 bg-gold-900/10' : 'border-ink-700 bg-ink-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <EmojiToken>{ARCH_EMOJI[v.id] ?? '🧭'}</EmojiToken>
                    <span
                      className={`flex-1 min-w-0 truncate text-sm font-semibold ${
                        chosen ? 'text-gold-200' : 'text-ink-100'
                      }`}
                      title={v.title}
                    >
                      {v.title}
                    </span>
                    {v.claimed ? (
                      <span className="chip !text-moss-300 !border-moss-700 shrink-0">бонус ✓</span>
                    ) : v.allDone ? (
                      <span className="chip !text-gold-300 !border-gold-700 shrink-0">готов</span>
                    ) : chosen ? (
                      <span className="chip !text-gold-300 !border-gold-700 shrink-0">выбран</span>
                    ) : null}
                  </div>
                  <p className="text-2xs text-ink-500 leading-snug min-h-[26px]" title={v.subtitle}>
                    {v.subtitle}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="meter flex-1 !h-[5px]">
                      <span
                        className="block h-full"
                        style={{
                          width: `${v.steps.length ? (doneCount / v.steps.length) * 100 : 0}%`,
                          background: 'var(--gold)',
                        }}
                      />
                    </span>
                    <span className="num text-2xs font-bold text-ink-300 shrink-0">
                      {doneCount}/{v.steps.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {next ? (
                      <button
                        onClick={() => {
                          haptic('selection');
                          setMainSkill(next.skillId);
                        }}
                        title={`Качать: ${next.skillName} до ур. ${next.target}`}
                        className="flex items-center gap-1 min-w-0 text-2xs text-sky-300 hover:text-sky-200 active:text-sky-200"
                      >
                        <PixelIcon name="target" size={9} className="shrink-0" />
                        <span className="truncate">
                          {next.skillName} → ур.{next.target}
                        </span>
                        <span className="num text-ink-600 shrink-0">ур.{next.level}</span>
                      </button>
                    ) : (
                      <span className="text-2xs text-gold-300">весь путь пройден</span>
                    )}
                    <span className="flex-1" />
                    {!v.claimed && v.allDone && rewardText && (
                      <span className="num text-2xs text-gold-300 shrink-0">{rewardText}</span>
                    )}
                  </div>
                  {!v.claimed && v.allDone ? (
                    <button
                      onClick={() => claimArchetype(v.id)}
                      className="btn btn-primary !min-h-[34px] !px-2 text-xs"
                    >
                      Забрать бонус
                    </button>
                  ) : !v.allDone ? (
                    <button
                      onClick={() => chooseArchetype(chosen ? '' : v.id)}
                      aria-pressed={chosen}
                      className={`!min-h-[34px] !px-2 text-xs ${chosen ? 'btn btn-secondary' : 'btn btn-ghost'}`}
                    >
                      {chosen ? 'Снять подсветку' : 'Следовать пути'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
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

/* ── The one big tree (pan + zoom viewport) ──────────────────────────────────────────────── */

interface SkillMapProps {
  skills: SkillInfo[];
  skillLevel: (id: string) => number;
  skillXp: (id: string) => number;
  unlocked: (s: SkillInfo) => boolean;
  firstGate: (s: SkillInfo) => { name: string; need: number } | null;
  mainSkillId: string | null | undefined;
  /** active archetype route (P1.3): golden chain + everything else dimmed */
  route: { title: string; steps: Array<{ skillId: string; target: number }> } | null;
  onPick: (id: string) => void;
}

const MIN_SCALE = 0.07;
const MAX_SCALE = 3;

const SkillMap: React.FC<SkillMapProps> = ({
  skills,
  skillLevel,
  skillXp,
  unlocked,
  firstGate,
  mainSkillId,
  route,
  onPick,
}) => {
  const map = useMemo(() => layoutGalaxy(skills), [skills]);
  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const schools = useMemo(() => [...new Set(skills.map((s) => s.branch))], [skills]);
  // groves with a real tree get a bigger root anchor on the map
  const keystoneIds = useMemo(() => new Set(map.roots.filter((r) => r.count > 1).map((r) => r.id)), [map.roots]);

  const [mapH, setMapH] = useState(420);
  const [scale, setScale] = useState(0.5);
  /** which school the map is filtered to (null = show everything) */
  const [school, setSchool] = useState<string | null>(null);
  const [showMini, setShowMini] = useState(false);
  const scaleRef = useRef(0.5);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mmWrapRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<SVGRectElement>(null);
  const mmDownRef = useRef(false);
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
    const maxL = Math.max(0, map.width * scale - el.clientWidth);
    const maxT = Math.max(0, map.height * scale - el.clientHeight);
    el.scrollLeft = clamp(a.cx * scale - a.px, 0, maxL);
    el.scrollTop = clamp(a.cy * scale - a.py, 0, maxT);
    anchorRef.current = null;
  }, [scale, map.width, map.height]);

  // fit the whole map onto the screen around a map point
  const fitTo = useCallback(
    (cx: number, cy: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const s = clamp(Math.min((el.clientWidth - 20) / map.width, (el.clientHeight - 20) / map.height), MIN_SCALE, 1);
      applyScale(s, { cx, cy, px: el.clientWidth / 2, py: el.clientHeight / 2 });
    },
    [map, applyScale]
  );
  const fitAll = useCallback(() => fitTo(map.width / 2, map.height / 2), [map, fitTo]);

  // where the main skill sits — the first view centers on it
  const mainPos = useMemo(() => {
    const n = map.nodes.find((x) => x.skill.id === mainSkillId);
    return n ? { x: n.x, y: n.y } : null;
  }, [map, mainSkillId]);

  // measure the map stage: it claims everything above the fold of the tab
  useLayoutEffect(() => {
    const measure = () => {
      const sc = document.getElementById('game-scroll');
      if (!sc) return;
      const stage = stageRef.current;
      if (!stage) return;
      const top = stage.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      setMapH(Math.max(280, sc.clientHeight - top - 16));
    };
    measure();
    const id = window.setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [map]);

  // first view after sizing is stable: centered on the main skill
  useLayoutEffect(() => {
    if (fittedRef.current || !scrollRef.current) return;
    const id = window.setTimeout(() => {
      fittedRef.current = true;
      if (mainPos) fitTo(mainPos.x, mainPos.y);
      else fitAll();
    }, 80);
    return () => window.clearTimeout(id);
  }, [mapH, mainPos, fitTo, fitAll]);

  // minimap viewport rectangle follows pan/zoom
  const syncViewport = useCallback(() => {
    const el = scrollRef.current;
    const r = vpRef.current;
    if (!el || !r) return;
    const svg = r.ownerSVGElement;
    if (!svg) return;
    const kx = svg.clientWidth / map.width;
    const ky = svg.clientHeight / map.height;
    r.setAttribute('x', String((el.scrollLeft / scaleRef.current) * kx));
    r.setAttribute('y', String((el.scrollTop / scaleRef.current) * ky));
    r.setAttribute('width', String((el.clientWidth / scaleRef.current) * kx));
    r.setAttribute('height', String((el.clientHeight / scaleRef.current) * ky));
  }, [map.width, map.height]);

  useLayoutEffect(() => {
    syncViewport();
  }, [scale, syncViewport, mapH, showMini]);

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
  }, [map, applyScale]);

  const small = scale < 0.62;
  const dimmed = (branch: string) => (school ? branch !== school : false);

  // Active archetype route: which nodes are milestones and where the thread runs
  const routeOn = !!route;
  const routeTarget = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of route?.steps ?? []) m.set(s.skillId, s.target);
    return m;
  }, [route]);
  const routePathD = useMemo(() => {
    if (!route || route.steps.length < 2) return '';
    const pts: Array<{ x: number; y: number }> = [];
    for (const s of route.steps) {
      const n = map.nodes.find((x) => x.skill.id === s.skillId);
      if (n) pts.push({ x: n.x, y: n.y });
    }
    if (pts.length < 2) return '';
    return `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
  }, [route, map.nodes]);

  // tap/drag on the minimap moves the big map to that spot
  const jumpMini = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    const wrap = mmWrapRef.current;
    if (!el || !wrap) return;
    const svg = wrap.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * map.width;
    const my = ((e.clientY - r.top) / r.height) * map.height;
    const maxL = Math.max(0, map.width * scaleRef.current - el.clientWidth);
    const maxT = Math.max(0, map.height * scaleRef.current - el.clientHeight);
    el.scrollLeft = clamp(mx * scaleRef.current - el.clientWidth / 2, 0, maxL);
    el.scrollTop = clamp(my * scaleRef.current - el.clientHeight / 2, 0, maxT);
  };

  // per-grove tint zones (a whisper of the root school's colour) + big anchors
  const zones = useMemo(
    () =>
      map.roots
        .map((r) => {
          const sk = skillById.get(r.id);
          const col = sk ? SCHOOL_TINT[sk.branch] : undefined;
          if (!sk || !col) return null;
          const dim = school ? sk.branch !== school : false;
          return { key: r.id, x: r.x, y: r.y, radius: r.radius, col, dim };
        })
        .filter(Boolean) as { key: string; x: number; y: number; radius: number; col: string; dim: boolean }[],
    [map.roots, skillById, school]
  );

  // faint dust so the empty space reads as a night map, not a blank sheet
  const stars = useMemo(() => {
    const n = Math.min(240, Math.max(80, Math.round((map.width * map.height) / 22000)));
    const out: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const a = seed / 233280;
      seed = (seed * 9301 + 49297) % 233280;
      const b = seed / 233280;
      out.push({ x: a * map.width, y: b * map.height, r: i % 4 === 0 ? 2 : 1, o: 0.08 + 0.12 * (i % 3) });
    }
    return out;
  }, [map.width, map.height]);

  // minimap dots + live viewport
  const mmW = 112;
  const mmH = Math.round(clamp((mmW * map.height) / Math.max(1, map.width), 60, 220));
  const mmKx = mmW / map.width;
  const mmKy = mmH / map.height;
  const miniDots = map.nodes.map((n) => {
    const lvl = skillLevel(n.skill.id);
    const onRouteDot = routeOn && routeTarget.has(n.skill.id);
    const color = onRouteDot
      ? 'var(--gold)'
      : mainSkillId === n.skill.id
        ? 'var(--gold)'
        : lvl > 0
          ? 'var(--moss)'
          : unlocked(n.skill)
            ? 'var(--text-mute)'
            : 'var(--line-strong)';
    return {
      key: n.skill.id,
      x: n.x * mmKx,
      y: n.y * mmKy,
      color,
      route: onRouteDot,
      dim: dimmed(n.skill.branch) || (!onRouteDot && routeOn),
    };
  });

  return (
    <div ref={mapWrapRef} className="relative border-2 border-ink-700 bg-ink-900">
      {/* school filter — a lens over the one tree, not a subsection */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5 pb-1 overflow-x-auto [scrollbar-width:none]">
        <ToolbarChip active={!school} onClick={() => setSchool(null)} label="Все школы" />
        {schools.map((branch) => {
          const meta = BRANCH_META[branch] ?? { name: branch, icon: '📌' };
          return (
            <ToolbarChip
              key={branch}
              active={school === branch}
              onClick={() => setSchool(school === branch ? null : branch)}
              label={`${meta.icon} ${meta.name}`}
            />
          );
        })}
      </div>

      <div ref={stageRef} className="relative" style={{ height: mapH }}>
        <div
          ref={scrollRef}
          onScroll={syncViewport}
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
          <div style={{ width: map.width * scale, height: map.height * scale }} />
          {/* the map itself at natural size, scaled as one picture */}
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: map.width,
              height: map.height,
              transform: `scale(${scale})`,
            }}
          >
            {/* dust + curved skill paths */}
            <svg width={map.width} height={map.height} className="absolute inset-0" aria-hidden="true">
              {stars.map((d, i) => (
                <rect key={i} x={d.x} y={d.y} width={d.r} height={d.r} fill="var(--line-strong)" opacity={d.o} />
              ))}

              {/* grove zones: faint coloured regions + a hairline boundary */}
              {zones.map((z) => (
                <g key={z.key} opacity={z.dim ? 0.05 : 1}>
                  <circle cx={z.x} cy={z.y} r={z.radius} fill={z.col} opacity={0.045} />
                  <circle cx={z.x} cy={z.y} r={z.radius} fill="none" stroke={z.col} strokeWidth={1} opacity={0.1} />
                </g>
              ))}

              {map.edges.map((e, i) => {
                const childSkill = skillById.get(e.childId);
                const childLvl = childSkill ? skillLevel(childSkill.id) : 0;
                const isLocked = childSkill ? !unlocked(childSkill) : false;
                const isDim = childSkill ? dimmed(childSkill.branch) : false;
                const offRoute = routeOn && childSkill ? !routeTarget.has(childSkill.id) : false;
                const baseOpacity = childLvl > 0 ? 0.85 : isLocked ? 0.4 : 0.65;
                const d = `M ${e.sx} ${e.sy} C ${e.c1x} ${e.c1y}, ${e.c2x} ${e.c2y}, ${e.ex} ${e.ey}`;
                return (
                  <g key={i}>
                    <path
                      d={d}
                      stroke={childLvl > 0 ? 'var(--moss)' : isLocked ? 'var(--line)' : 'var(--line-strong)'}
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray={isLocked ? '4 4' : undefined}
                      opacity={isDim || offRoute ? baseOpacity * 0.14 : baseOpacity}
                    />
                    {childLvl > 0 && !isDim && !offRoute && (
                      <path
                        d={d}
                        className="map-learned-flow"
                        stroke="#9ccf97"
                        strokeWidth={2}
                        fill="none"
                        opacity={0.9}
                      />
                    )}
                  </g>
                );
              })}

              {/* the chosen route: one golden thread through its milestones */}
              {routePathD && (
                <g aria-hidden="true">
                  <path d={routePathD} stroke="var(--gold)" strokeWidth={8} fill="none" opacity={0.13} />
                  <path
                    d={routePathD}
                    className="map-route-flow"
                    stroke="var(--gold)"
                    strokeWidth={2.5}
                    fill="none"
                    opacity={0.95}
                  />
                </g>
              )}
            </svg>

            {map.nodes.map(({ skill, x, y }) => {
              const level = skillLevel(skill.id);
              const isMain = mainSkillId === skill.id;
              const isUnlocked = unlocked(skill);
              const isLearned = level > 0;
              const xp = skillXp(skill.id);
              const xpPercent = Math.min(100, Math.round((xp / Math.max(1, xpToNext(level))) * 100));
              const gate = isUnlocked ? null : firstGate(skill);
              const isDim = dimmed(skill.branch);
              // roots of real groves are drawn as bigger "keystone" anchors
              const isKeystone = keystoneIds.has(skill.id);
              const w = isKeystone ? KEYSTONE_W : NODE_W;
              const h = isKeystone ? KEYSTONE_H : NODE_H;

              // Archetype route mode: milestone nodes wear gold; off-path fades
              const onRoute = routeOn && routeTarget.has(skill.id);
              const offRoute = routeOn && !onRoute;
              const routeDone = onRoute && level >= (routeTarget.get(skill.id) ?? Infinity);

              const frame = !routeOn
                ? isMain
                  ? 'border-gold-700 bg-gold-900/15'
                  : isLearned
                    ? 'border-moss-700 bg-moss-900/20'
                    : isKeystone
                      ? 'border-ink-500 bg-ink-900'
                      : isUnlocked
                        ? 'border-ink-600 bg-ink-900'
                        : 'border-ink-700 bg-ink-900/60'
                : onRoute
                  ? routeDone
                    ? 'border-gold-500 bg-gold-900/25'
                    : 'border-gold-700 bg-gold-900/10'
                  : isLearned
                    ? 'border-moss-700/60 bg-moss-900/15'
                    : isKeystone
                      ? 'border-ink-500 bg-ink-900'
                      : isUnlocked
                        ? 'border-ink-600 bg-ink-900'
                        : 'border-ink-700 bg-ink-900/60';

              return (
                <button
                  key={skill.id}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (isUnlocked) onPick(skill.id);
                  }}
                  disabled={!isUnlocked}
                  title={
                    onRoute
                      ? routeDone
                        ? `Веха пути «${route?.title}» пройдена: ${skill.name} ур. ${routeTarget.get(skill.id)}`
                        : `Веха пути «${route?.title}»: ${skill.name} до ур. ${routeTarget.get(skill.id)} (сейчас ${level}) — тап, чтобы качать`
                      : isMain
                        ? `Основной навык — учёба и работа качают его (ур. ${level})`
                        : !isUnlocked && gate
                          ? `${skill.flavor} Нужно: ${gate.name} ${gate.need}+`
                          : isKeystone
                            ? `${skill.name} — корень школы${isLearned ? ` (ур. ${level})` : ''}`
                            : `Сделать основным: ${skill.name}`
                  }
                  className={`absolute -translate-x-1/2 flex flex-col items-center justify-center border-2 text-center transition-transform active:translate-y-[1px] ${
                    isUnlocked && !isMain ? (onRoute ? 'hover:border-gold-600' : 'hover:border-ink-400') : ''
                  } ${frame} ${isDim ? 'opacity-[0.15] pointer-events-none' : offRoute ? 'opacity-30' : isUnlocked ? '' : 'opacity-75'}`}
                  style={{ left: x, top: y, width: w, height: h }}
                >
                  <span className="relative">
                    <EmojiToken className={isKeystone ? '!w-9 !h-9 !text-[18px]' : '!w-7 !h-7 !text-[14px]'}>
                      {SKILL_EMOJI[skill.id] ?? '📌'}
                    </EmojiToken>
                    {isMain && (
                      <span className="absolute -top-1 -right-1 bg-ink-900 border border-gold-700 p-[1px]">
                        <PixelIcon name="target" size={8} className="text-gold-300" />
                      </span>
                    )}
                  </span>

                  {!small && (
                    <>
                      <span
                        className={`w-full px-1 mt-1 leading-[1.15] truncate ${
                          isKeystone ? 'text-[11px] font-bold tracking-[0.01em]' : 'text-[10px] font-semibold'
                        } ${
                          isMain
                            ? 'text-gold-200'
                            : onRoute
                              ? routeDone
                                ? 'text-gold-200'
                                : 'text-gold-300'
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
                            className="flex items-center gap-1 min-w-0 w-full justify-center text-[10px] leading-none text-ink-400"
                            title={`Нужно: ${gate.name} ${gate.need}+`}
                          >
                            <PixelIcon name="lock" size={8} className="shrink-0 text-ink-500" />
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
            })}
          </div>
        </div>

        {/* zoom controls + minimap toggle */}
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5">
          <div className="flex gap-1">
            <MapBtn title="Отдалить" onClick={() => zoomBy(1 / 1.4)} label="−" />
            <MapBtn title="Приблизить" onClick={() => zoomBy(1.4)} label="+" />
            <MapBtn title="Показать всё дерево" onClick={fitAll} label="⌂" />
            <MapBtn
              title={showMini ? 'Спрятать мини-карту' : 'Мини-карта'}
              active={showMini}
              onClick={() => setShowMini((v) => !v)}
              label="▦"
            />
          </div>

          {/* minimap — the whole tree at a glance; tap/drag to jump */}
          {showMini && (
            <div
              ref={mmWrapRef}
              className="border-2 border-ink-600 bg-ink-900/95 p-1 touch-none cursor-crosshair select-none"
              onPointerDown={(e) => {
                mmDownRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                jumpMini(e);
              }}
              onPointerMove={(e) => {
                if (mmDownRef.current) jumpMini(e);
              }}
              onPointerUp={() => {
                mmDownRef.current = false;
              }}
            >
              <svg width={mmW} height={mmH} className="block">
                <rect width={mmW} height={mmH} fill="var(--well)" />
                {miniDots.map((d) => (
                  <rect
                    key={d.key}
                    x={Math.round((d.x - (d.route ? 1.5 : 1)) * 10) / 10}
                    y={Math.round((d.y - (d.route ? 1.5 : 1)) * 10) / 10}
                    width={d.route ? 3 : 2}
                    height={d.route ? 3 : 2}
                    fill={d.color}
                    opacity={d.dim ? (d.route ? 0.5 : 0.12) : 1}
                  />
                ))}
                <rect
                  ref={vpRef}
                  x={0}
                  y={0}
                  width={10}
                  height={10}
                  fill="rgba(233,237,244,0.08)"
                  stroke="var(--sky)"
                  strokeWidth={1}
                />
              </svg>
            </div>
          )}
        </div>

        <div className="absolute bottom-1.5 left-2 right-2 z-10 flex items-end justify-between gap-2 pointer-events-none">
          <p className="text-2xs text-ink-600 leading-tight">
            {route ? (
              <>
                золотая нить — <span className="text-gold-400 font-semibold">«{route.title}»</span> · тап по вехе —
                сделать основным
              </>
            ) : school ? (
              <>
                показана школа <span className="text-ink-400 font-semibold">{BRANCH_META[school]?.name ?? school}</span>{' '}
                · тап по «Все школы» — вернуть
              </>
            ) : (
              <>одно дерево всех школ · тяни, чтобы смотреть</>
            )}
          </p>
          <span className="num text-2xs text-ink-600 shrink-0">{Math.round(scale * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

const MapBtn: React.FC<{ title: string; onClick: () => void; label: string; active?: boolean }> = ({
  title,
  onClick,
  label,
  active,
}) => (
  <button
    title={title}
    aria-label={title}
    aria-pressed={active}
    onClick={onClick}
    className={`!min-h-[36px] !min-w-[36px] !px-0 !py-0 text-sm leading-none flex items-center justify-center select-none ${
      active ? 'btn btn-primary' : 'btn btn-secondary'
    }`}
  >
    {label}
  </button>
);

const ToolbarChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 px-2.5 text-xs font-semibold border-2 whitespace-nowrap transition-colors touch-target !min-h-[38px] ${
      active
        ? 'border-gold-700 bg-gold-900/20 text-gold-200'
        : 'border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-500 hover:text-ink-200'
    }`}
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

/**
 * Grove tints: each school's region gets a whisper of its own colour so the
 * map reads in zones at a glance. Alphas stay very low — the tint must never
 * fight the node state frames (moss = learned, gold = main skill).
 */
const SCHOOL_TINT: Record<string, string> = {
  frontend: '#f4d35e', // gold
  backend: '#a9c6e0', // sky
  mobile: '#e6b478', // ochre
  qa: '#d3b48f', // wood
  devops: '#9ccf97', // moss
  ai_ml: '#e08b8d', // clay
  cybersec: '#8bb0d0', // sky deep
  gamedev: '#c2c9d5', // ink light
  blockchain: '#eec44a', // gold deep
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
