import { t } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { officeArtwork, officeTierOf, OFFICE_TIER_META } from '../lib/officeArt';
import { officeMoodOf, OFFICE_MOOD_META, type OfficeMoodInput } from '../lib/officeMood';
import { ScreenTitle, SectionTitle, EmptyState } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
/**
 * Офис (docs/design.md §11) — карточка события поверх тех же work-действий
 * (фаза 3 редизайна 22.10.2026): баннер-сцена тира + строки-действия из общего
 * каталога, как в RoomView. Открывается из «Работы»; отдельной вкладки нет.
 */
const SIZE_LABELS: Record<string, string> = {
  enterprise: t('Корпорация'),
  startup: t('Стартап'),
  product: t('Продукт'),
  outsource: t('Аутсорс'),
};
const TEAM = [{ npcId: 'teamlead' }, { npcId: 'junior_colleague' }, { npcId: 'toxic_senior' }];
const ACTIONS = [
  { id: 'work_task', icon: 'briefcase', name: t('Закрыть задачу'), energy: 4 },
  { id: 'work_overtime', icon: 'moon', name: t('Овертайм'), energy: 5 },
  { id: 'networking', icon: 'people', name: t('Стендап / 1:1'), energy: 2 },
];
function relationMeta(value: number): {
  icon: string;
  label: string;
  cls: string;
} {
  if (value >= 30) return { icon: 'people', label: t('друг'), cls: 'text-moss-300' };
  if (value >= 0) return { icon: 'people', label: t('нейтрально'), cls: 'text-ink-400' };
  if (value >= -30) return { icon: 'warn', label: t('натянуто'), cls: 'text-ochre-300' };
  return { icon: 'warn', label: t('конфликт'), cls: 'text-clay-300' };
}
export const OfficeView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const setView = useGameStore((s) => s.setView);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const [busy, setBusy] = useState<string | null>(null);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      fetch('/api/content/npcs').then((r) => r.json()),
      fetch('/api/content/companies').then((r) => r.json()),
    ])
      .then(([n, c]) => {
        setNpcs(n.npcs ?? []);
        setCompanies(c.companies ?? []);
      })
      .catch(() => setLoadError(t('Не удалось загрузить офис')));
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
          {t('← Карьера')}
        </button>
        <div className="card">
          <EmptyState
            bare
            icon="screen"
            title={t('Офиса пока нет')}
            hint={t('Сначала найди работу — тогда здесь появится твой open-space')}
          />
          <button onClick={back} className="btn btn-primary w-full mt-3">
            {t('К вакансиям')}
          </button>
        </div>
      </div>
    );
  }
  const company = companies.find((c: any) => c.id === player.job.companyId);
  const tier = officeTierOf(player.grade);
  const meta = OFFICE_TIER_META[tier];
  const mood = officeMoodOf({
    currentDay: player.currentDay ?? 1,
    energy: player.energy ?? 0,
    maxEnergy: player.maxEnergy ?? 16,
    motivation: player.motivation ?? 50,
  } satisfies OfficeMoodInput);
  const moodMeta = OFFICE_MOOD_META[mood];
  const runAction = async (actionId: string) => {
    setBusy(actionId);
    await performAction(actionId);
    setBusy(null);
  };
  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={back} className="link-back">
        {t('← Карьера')}
      </button>

      <ScreenTitle
        icon="screen"
        meta={<span>{company ? (SIZE_LABELS[company.size] ?? company.size) : t('Офис')}</span>}
      >
        {company?.name ?? t('Мой офис')}
      </ScreenTitle>

      {error && (
        <div role="alert" className="card card-sm cursor-pointer" onClick={clearError}>
          <p className="text-sm text-clay-300"> {error}</p>
        </div>
      )}
      {loadError && (
        <div role="alert" className="card card-sm">
          <p className="text-sm text-clay-300">{loadError}</p>
        </div>
      )}

      <section className="story-card" aria-label={t('Твой офис')}>
        <div className="story-card-kicker">
          {t('офис ·')} {tier} · <PixelIcon name={moodMeta.icon} size={12} /> {moodMeta.label}
        </div>
        <img
          className="story-card-art"
          src={officeArtwork(tier)}
          alt=""
          width={512}
          height={384}
          onError={(ev) => {
            // Сцена — украшение и настроение, а не контракт: нет файла —
            // карточка остаётся текстовой (тот же приём, что у комнаты).
            ev.currentTarget.style.display = 'none';
          }}
        />
        <div className="story-card-copy">
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="story-choices">
          {ACTIONS.map((a) => {
            const missing = (player.energy ?? 0) >= a.energy ? [] : [t('мало энергии')];
            return (
              <div className="story-choice-group" key={a.id}>
                <button
                  className="story-choice story-choice-green"
                  disabled={busy !== null || missing.length > 0}
                  onClick={() => runAction(a.id)}
                >
                  <span>
                    <PixelIcon name={a.icon} size={12} /> {busy === a.id ? t('Делаем…') : a.name}
                  </span>
                  <span className="story-choice-effects">
                    <span className="res-chip num">−{a.energy}</span>
                  </span>
                </button>
                {missing.length > 0 && <p className="story-requirements">{missing.join(' · ')}</p>}
              </div>
            );
          })}
        </div>
        <p className="story-footnote">
          {t('Офис растёт вместе с грейдом: опенспейс → кабинет → свой этаж → верхний этаж.')}
        </p>
      </section>

      {/* Team */}
      <div>
        <SectionTitle className="mb-2">{t('Команда')}</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {TEAM.map((t) => {
            const npc = npcs.find((n: any) => n.id === t.npcId);
            const value = player.relationships?.[t.npcId] ?? 0;
            const rel = relationMeta(value);
            // Same source as FriendsView: avatar field in npcs.json (.png),
            // we serve the optimised .webp in /art/npcs/.
            const portrait = npc?.avatar ? `/art/npcs/${String(npc.avatar).replace(/\.png$/i, '.webp')}` : null;
            return (
              <div key={t.npcId} className="card card-sm text-center" title={npc?.description ?? ''}>
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
                  <span className="mx-auto">
                    <PixelIcon name="people" size={18} />
                  </span>
                )}
                <p className="text-xs font-medium text-ink-100 truncate mt-1.5">{npc?.name ?? t.npcId}</p>
                <p className={`flex items-center justify-center gap-1 text-2xs mt-0.5 ${rel.cls}`} title={rel.label}>
                  <PixelIcon name={rel.icon} size={12} />
                  <span className="num">{value > 0 ? `+${value}` : value}</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className="subtle mt-2">{t('Отношения качаются событиями и нетворкингом')}</p>
      </div>
    </div>
  );
};
