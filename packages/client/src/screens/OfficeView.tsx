import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { CareerPressureCard } from '../components/CareerPressureCard';
import {
  OfficeRenderer,
  buildOfficeComposition,
  officeMoodOf,
} from '../components/room/OfficeRenderer';
import { buildAvatarData, fetchPixelPack, PixelAvatarData } from '../components/room/pixelAvatar';

/**
 * Office (docs/design.md §11) — a skin over the same work actions, rendered with
 * the layer engine. Opened from Career while employed; no tab button.
 */

const SIZE_LABELS: Record<string, string> = {
  enterprise: '🏢 Корпорация',
  startup: '🚀 Стартап',
  product: '📦 Продукт',
  outsource: '🧩 Аутсорс',
};

const TEAM = [
  { npcId: 'teamlead', emoji: '🧑‍💼', layer: 'lead' },
  { npcId: 'junior_colleague', emoji: '👩‍💻', layer: 'junior' },
  { npcId: 'toxic_senior', emoji: '😠', layer: 'toxic' },
];

function relationMeta(value: number): { icon: string; label: string; cls: string } {
  if (value >= 30) return { icon: '💚', label: 'друг', cls: 'text-emerald-400' };
  if (value >= 0) return { icon: '💛', label: 'нейтрально', cls: 'text-amber-400' };
  if (value >= -30) return { icon: '🧡', label: 'натянуто', cls: 'text-orange-400' };
  return { icon: '💔', label: 'конфликт', cls: 'text-red-400' };
}

export const OfficeView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const setView = useGameStore((s) => s.setView);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);

  const [officeManifest, setOfficeManifest] = useState<any>(null);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [pixelPack, setPixelPack] = useState<Awaited<ReturnType<typeof fetchPixelPack>>>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/layers').then((r) => r.json()),
      fetch('/api/content/npcs').then((r) => r.json()),
      fetch('/api/content/companies').then((r) => r.json()),
      fetchPixelPack(),
    ])
      .then(([l, n, c, pixel]) => {
        setOfficeManifest(l.office);
        setNpcs(n.npcs ?? []);
        setCompanies(c.companies ?? []);
        setPixelPack(pixel);
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
        <button onClick={back} className="text-sm text-primary-400 active:scale-95 transition-all">
          ← Карьера
        </button>
        <div className="game-card text-center py-10">
          <div className="text-5xl mb-3">🏢</div>
          <h2 className="text-base font-bold text-white mb-1">Офиса пока нет</h2>
          <p className="text-sm text-slate-400 mb-4">Сначала найди работу — тогда здесь появится твой open-space</p>
          <button
            onClick={back}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-95 text-white rounded-xl text-sm font-medium transition-all touch-target"
          >
            💼 К вакансиям
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
  const pixelAvatarData: PixelAvatarData | null =
    pixelPack && player.genetics ? buildAvatarData(pixelPack, player.genetics, player.avatar) : null;
  const ready = officeManifest;

  const canAct = (energy: number) => (player.energy ?? 0) >= energy;

  const ACTIONS = [
    { id: 'work_task', icon: '💼', name: 'Закрыть задачу', energy: 4 },
    { id: 'work_overtime', icon: '🌙', name: 'Овертайм', energy: 5 },
    { id: 'networking', icon: '🗣️', name: 'Стендап / 1:1', energy: 2 },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <button onClick={back} className="text-sm text-primary-400 active:scale-95 transition-all">
          ← Карьера
        </button>
        <span className="text-[11px] text-slate-500">
          {company ? SIZE_LABELS[company.size] ?? company.size : '🏢 Офис'}
        </span>
      </div>

      <h2 className="text-lg font-bold text-white -mt-2">🏢 {company?.name ?? 'Мой офис'}</h2>

      {error && (
        <div className="game-card border-red-500/40 bg-red-500/10 cursor-pointer" onClick={clearError}>
          <p className="text-sm text-red-300">⚠️ {error}</p>
        </div>
      )}
      {loadError && (
        <div className="game-card border-red-500/40 bg-red-500/10">
          <p className="text-sm text-red-300">⚠️ {loadError}</p>
        </div>
      )}

      {/* Office render */}
      {ready ? (
        <OfficeRenderer
          officeManifest={officeManifest}
          composition={composition}
          mood={mood}
          pixelAvatar={pixelAvatarData}
        />
      ) : (
        <div className="aspect-square rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500">
          Открываем офис…
        </div>
      )}

      {/* Team */}
      <div>
        <h3 className="section-title mb-2">👥 Команда</h3>
        <div className="grid grid-cols-3 gap-2">
          {TEAM.map((t) => {
            const meta = npcs.find((n: any) => n.id === t.npcId);
            const value = player.relationships?.[t.npcId] ?? 0;
            const rel = relationMeta(value);
            return (
              <div key={t.npcId} className="game-card !p-2.5 text-center" title={meta?.description ?? ''}>
                <div className="text-2xl">{t.emoji}</div>
                <p className="text-[11px] font-medium text-slate-200 truncate mt-1">
                  {meta?.name ?? t.npcId}
                </p>
                <p className={`text-[10px] ${rel.cls}`}>
                  {rel.icon} {value > 0 ? `+${value}` : value}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Отношения качаются событиями и нетворкингом</p>
      </div>

      {/* Office actions — the same work API, office flavor */}
      <div>
        <h3 className="section-title mb-2">⚡ Рабочий день</h3>
        <div className="grid grid-cols-3 gap-2">
          {ACTIONS.map((a) => {
            const enabled = canAct(a.energy);
            return (
              <button
                key={a.id}
                onClick={() => performAction(a.id)}
                disabled={!enabled}
                className={`game-card !p-2.5 text-center transition-all ${
                  enabled ? 'hover:border-primary-500/50 active:scale-95' : 'opacity-50'
                }`}
              >
                <div className="text-xl">{a.icon}</div>
                <p className="text-[11px] font-medium text-slate-200 mt-1 leading-tight">{a.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">⚡{a.energy}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Учёба и отдых — во вкладке «День»</p>
      </div>

      {/* Promotion progress (same panel as Day) */}
      <CareerPressureCard />
    </div>
  );
};
