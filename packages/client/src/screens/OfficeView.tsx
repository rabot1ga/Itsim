import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { CareerPressureCard } from '../components/CareerPressureCard';
import {
  OfficeRenderer,
  buildOfficeComposition,
  officeMoodOf,
} from '../components/room/OfficeRenderer';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { EmojiToken } from '../components/ui';

/**
 * Office (docs/design.md §11) — a skin over the same work actions, rendered with
 * the layer engine. Opened from Career while employed; no tab button.
 */

const SIZE_LABELS: Record<string, string> = {
  enterprise: 'Корпорация',
  startup: 'Стартап',
  product: 'Продукт',
  outsource: 'Аутсорс',
};

const TEAM = [
  { npcId: 'teamlead', emoji: '🧑‍💼', layer: 'lead' },
  { npcId: 'junior_colleague', emoji: '👩‍💻', layer: 'junior' },
  { npcId: 'toxic_senior', emoji: '😠', layer: 'toxic' },
];

function relationMeta(value: number): { icon: string; label: string; cls: string } {
  if (value >= 30) return { icon: 'heart', label: 'друг', cls: 'text-moss-400' };
  if (value >= 0) return { icon: 'heart', label: 'нейтрально', cls: 'text-ink-400' };
  if (value >= -30) return { icon: 'heart', label: 'натянуто', cls: 'text-ochre-400' };
  return { icon: 'warn', label: 'конфликт', cls: 'text-clay-400' };
}

export const OfficeView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const setView = useGameStore((s) => s.setView);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);

  const [officeManifest, setOfficeManifest] = useState<any>(null);
  const [avatarManifest, setAvatarManifest] = useState<any>(null);
  const [geneticsConfig, setGeneticsConfig] = useState<any>(null);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/layers').then((r) => r.json()),
      fetch('/api/content/npcs').then((r) => r.json()),
      fetch('/api/content/companies').then((r) => r.json()),
      fetch('/api/content/genetics').then((r) => r.json()),
    ])
      .then(([l, n, c, g]) => {
        setOfficeManifest(l.office);
        setAvatarManifest(l.avatar);
        setNpcs(n.npcs ?? []);
        setCompanies(c.companies ?? []);
        setGeneticsConfig(g.genetics);
      })
      .catch(() => setLoadError('Не удалось загрузить офис'));
  }, []);

  if (!player) return null;

  const back = () => {
    haptic('selection');
    setView('career');
  };

  // Unemployed stub — the office exists only with a job
  if (!player.job) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={back} className="flex items-center gap-1.5 text-sm text-ink-400">
          <PixelIcon name="chevron" size={10} className="rotate-90" />
          Карьера
        </button>
        <div className="panel text-center py-10">
          <PixelIcon name="briefcase" size={32} className="text-ink-600 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-white mb-1">Офиса пока нет</h2>
          <p className="text-sm text-ink-400 mb-4 max-w-[32ch] mx-auto leading-relaxed">
            Сначала найди работу — тогда здесь появится твой open-space
          </p>
          <button onClick={back} className="btn btn-primary !min-h-[38px] text-sm">
            К вакансиям
          </button>
        </div>
      </div>
    );
  }

  const company = companies.find((c: any) => c.id === player.job.companyId);
  const input = {
    grade: player.grade,
    companySize: company?.size ?? 'outsource',
    currentDay: player.currentDay ?? 1,
    energy: player.energy ?? 0,
    maxEnergy: player.maxEnergy ?? 16,
    motivation: player.motivation ?? 50,
    achievements: player.achievements ?? [],
    relationships: player.relationships ?? {},
  };
  const mood = officeMoodOf(input);
  const composition = buildOfficeComposition(input);
  const ready = officeManifest;

  const canAct = (energy: number) => (player.energy ?? 0) >= energy;

  const ACTIONS = [
    { id: 'work_task', icon: 'briefcase', name: 'Закрыть задачу', energy: 4 },
    { id: 'work_overtime', icon: 'moon', name: 'Овертайм', energy: 5 },
    { id: 'networking', icon: 'chat', name: 'Стендап / 1:1', energy: 2 },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <button onClick={back} className="flex items-center gap-1.5 text-sm text-ink-400">
          <PixelIcon name="chevron" size={10} className="rotate-90" />
          Карьера
        </button>
        <span className="text-xs text-ink-500">
          {company ? SIZE_LABELS[company.size] ?? company.size : 'Офис'}
        </span>
      </div>

      <h2 className="flex items-center gap-2 text-base font-semibold text-white -mt-2">
        <PixelIcon name="briefcase" size={14} className="text-gold-300" />
        {company?.name ?? 'Мой офис'}
      </h2>

      {error && (
        <div className="game-card border-clay-500/40 bg-clay-500/10 cursor-pointer" onClick={clearError}>
          <p className="flex items-start gap-2 text-sm text-clay-300"><PixelIcon name="warn" size={12} className="mt-0.5" />{error}</p>
        </div>
      )}
      {loadError && (
        <div className="game-card border-clay-500/40 bg-clay-500/10">
          <p className="flex items-start gap-2 text-sm text-clay-300"><PixelIcon name="warn" size={12} className="mt-0.5" />{loadError}</p>
        </div>
      )}

      {/* Office render */}
      {ready ? (
        <OfficeRenderer
          officeManifest={officeManifest}
          composition={composition}
          mood={mood}
          avatarManifest={avatarManifest}
          traits={player.genetics}
          geneticsConfig={geneticsConfig}
          avatarCustom={player.avatar}
        />
      ) : (
        <div className="aspect-square rounded-xl border border-ink-700 bg-ink-800 flex items-center justify-center text-sm text-ink-500">
          Открываем офис…
        </div>
      )}

      {/* Team */}
      <div>
        <h3 className="section-title mb-2">Команда</h3>
        <div className="grid grid-cols-3 gap-2">
          {TEAM.map((t) => {
            const meta = npcs.find((n: any) => n.id === t.npcId);
            const value = player.relationships?.[t.npcId] ?? 0;
            const rel = relationMeta(value);
            return (
              <div key={t.npcId} className="panel !p-2.5 text-center" title={meta?.description ?? ''}>
                <EmojiToken className="mx-auto">{t.emoji}</EmojiToken>
                <p className="text-xs font-medium text-ink-100 truncate mt-1.5">
                  {meta?.name ?? t.npcId}
                </p>
                <p className={`flex items-center justify-center gap-1 text-2xs mt-0.5 ${rel.cls}`}>
                  <PixelIcon name={rel.icon} size={9} />
                  <span className="num">{value > 0 ? `+${value}` : value}</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-2xs text-ink-600 mt-1.5">Отношения качаются событиями и нетворкингом</p>
      </div>

      {/* Office actions — the same work API, office flavor */}
      <div>
        <h3 className="section-title mb-2">Рабочий день</h3>
        <div className="grid grid-cols-3 gap-2">
          {ACTIONS.map((a) => {
            const enabled = canAct(a.energy);
            return (
              <button
                key={a.id}
                onClick={() => performAction(a.id)}
                disabled={!enabled}
                className="tile text-center !flex !flex-col !items-center"
              >
                <PixelIcon name={a.icon} size={15} className="text-ink-300" />
                <p className="text-xs font-medium text-ink-100 mt-1.5 leading-tight">{a.name}</p>
                <p className="flex items-center justify-center gap-1 text-2xs text-ink-500 mt-1">
                  <PixelIcon name="bolt" size={9} className="text-sky-300/70" />
                  <span className="num">{a.energy}</span>
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-2xs text-ink-600 mt-1.5">Учёба и отдых — во вкладке «День»</p>
      </div>

      {/* Promotion progress (same panel as Day) */}
      <CareerPressureCard />
    </div>
  );
};
