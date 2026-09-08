import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { IsoOffice } from '../components/iso/IsoOffice';
import { officeMoodOf } from '../components/room/OfficeRenderer';
import { EmojiToken, ScreenTitle, SectionTitle, EmptyState, Skeleton } from '../components/ui';

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
  { npcId: 'teamlead', layer: 'lead' },
  { npcId: 'junior_colleague', layer: 'junior' },
  { npcId: 'toxic_senior', layer: 'toxic' },
];

function relationMeta(value: number): { emoji: string; label: string; cls: string } {
  if (value >= 30) return { emoji: '💚', label: 'друг', cls: 'text-moss-300' };
  if (value >= 0) return { emoji: '🙂', label: 'нейтрально', cls: 'text-ink-400' };
  if (value >= -30) return { emoji: '😕', label: 'натянуто', cls: 'text-ochre-300' };
  return { emoji: '⚠️', label: 'конфликт', cls: 'text-clay-300' };
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/npcs').then((r) => r.json()),
      fetch('/api/content/companies').then((r) => r.json()),
    ])
      .then(([n, c]) => {
        setOfficeManifest(true);
        setNpcs(n.npcs ?? []);
        setCompanies(c.companies ?? []);
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
        <button onClick={back} className="link-back">
          ← Карьера
        </button>
        <div className="card">
          <EmptyState
            bare
            emoji="💼"
            title="Офиса пока нет"
            hint="Сначала найди работу — тогда здесь появится твой open-space"
          />
          <button onClick={back} className="btn btn-primary w-full mt-3">
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
  const ready = officeManifest;

  const canAct = (energy: number) => (player.energy ?? 0) >= energy;

  const ACTIONS = [
    { id: 'work_task', emoji: '💻', name: 'Закрыть задачу', energy: 4 },
    { id: 'work_overtime', emoji: '🌙', name: 'Овертайм', energy: 5 },
    { id: 'networking', emoji: '💬', name: 'Стендап / 1:1', energy: 2 },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={back} className="link-back">
        ← Карьера
      </button>

      <ScreenTitle emoji="🏢" meta={<span>{company ? (SIZE_LABELS[company.size] ?? company.size) : 'Офис'}</span>}>
        {company?.name ?? 'Мой офис'}
      </ScreenTitle>

      {error && (
        <div role="alert" className="card card-sm cursor-pointer" onClick={clearError}>
          <p className="text-sm text-clay-300">⚠ {error}</p>
        </div>
      )}
      {loadError && (
        <div role="alert" className="card card-sm">
          <p className="text-sm text-clay-300">⚠ {loadError}</p>
        </div>
      )}

      {/* Office render */}
      {ready ? (
        <IsoOffice
          office={{
            companyId: company?.id ?? player.job?.companyId,
            companySize: company?.size,
            grade: player.job?.grade,
            teamSize: TEAM.length,
            mood,
            seed: company?.id ?? player.job?.companyId,
          }}
          player={player}
        />
      ) : (
        <Skeleton className="aspect-square" />
      )}

      {/* Team */}
      <div>
        <SectionTitle className="mb-2">Команда</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {TEAM.map((t) => {
            const meta = npcs.find((n: any) => n.id === t.npcId);
            const value = player.relationships?.[t.npcId] ?? 0;
            const rel = relationMeta(value);
            // Same source as FriendsView: avatar field in npcs.json (.png),
            // we serve the optimised .webp in /art/npcs/.
            const portrait = meta?.avatar ? `/art/npcs/${String(meta.avatar).replace(/\.png$/i, '.webp')}` : null;
            return (
              <div key={t.npcId} className="card card-sm text-center" title={meta?.description ?? ''}>
                {portrait ? (
                  <img
                    src={portrait}
                    width={44}
                    height={44}
                    loading="lazy"
                    decoding="async"
                    alt=""
                    className="npc-portrait mx-auto"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <EmojiToken className="mx-auto">🧑‍💻</EmojiToken>
                )}
                <p className="text-xs font-medium text-ink-100 truncate mt-1.5">{meta?.name ?? t.npcId}</p>
                <p className={`flex items-center justify-center gap-1 text-2xs mt-0.5 ${rel.cls}`} title={rel.label}>
                  <span aria-hidden="true">{rel.emoji}</span>
                  <span className="num">{value > 0 ? `+${value}` : value}</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className="subtle mt-2">Отношения качаются событиями и нетворкингом</p>
      </div>

      {/* Office actions — the same work API, office flavor */}
      <div>
        <SectionTitle className="mb-2">Рабочий день</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {ACTIONS.map((a) => {
            const enabled = canAct(a.energy);
            return (
              <button key={a.id} onClick={() => performAction(a.id)} disabled={!enabled} className="tile text-center">
                <span className="tile-icon" aria-hidden="true">
                  {a.emoji}
                </span>
                <p className="tile-label">{a.name}</p>
                <p className="tile-meta num">⚡ {a.energy}</p>
              </button>
            );
          })}
        </div>
        <p className="subtle mt-2">Учёба и отдых — на «Главной»</p>
      </div>
    </div>
  );
};
