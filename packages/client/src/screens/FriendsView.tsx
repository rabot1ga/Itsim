import { t } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, EmptyState, Spinner, ResChip } from '../components/ui';
import { inviteLink, openTelegramLink, haptic } from '../lib/telegram';
import { PixelIcon } from '../components/pixel/PixelIcon';
import {
  relationEffectLabelKey,
  spentTimeToday,
  SPEND_TIME_RELATION,
  RECOMMENDATION_COST,
  FREELANCE_LEAD_COST,
  P2P_DISCOUNT_COST,
} from '@itsim/shared';
interface Friend {
  id: string;
  name: string;
  description: string;
  initialRelation: number;
  avatar: string | null;
}
const BOT_NAME = 'itlife_simulator_bot';
/** Relationship label — the same words the events use. */
function relationLabel(relation: number): string {
  if (relation >= 60) return t('Близкий друг');
  if (relation >= 30) return t('Друг');
  if (relation < 0) return t('Напряжённые отношения');
  return t('Знакомый');
}
export const FriendsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const [people, setPeople] = useState<Friend[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch('/api/content/npcs', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('npcs');
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data.npcs)) throw new Error('npcs');
        setPeople(data.npcs);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [attempt]);
  const invite = () => {
    haptic('medium');
    openTelegramLink(inviteLink(BOT_NAME, player?.telegramId ?? 'player'));
  };
  /** D1: «Провести время с другом» — энергия → отношения, раз в день на NPC. */
  const [spending, setSpending] = useState<string | null>(null);
  const spendTime = async (npcId: string) => {
    haptic('tap');
    setSpending(npcId);
    try {
      await useGameStore.getState().performAction('spend_time_with_friend', { npcId });
    } finally {
      setSpending(null);
    }
  };
  /** D2: связи как ресурс — одноразовые баффы за contacts. */
  const [using, setUsing] = useState<string | null>(null);
  const useContact = async (actionId: string) => {
    haptic('tap');
    setUsing(actionId);
    try {
      await useGameStore.getState().performAction(actionId, {});
    } finally {
      setUsing(null);
    }
  };
  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => useGameStore.getState().setView('career')} className="link-back">
        {t('← Работа')}
      </button>
      <ScreenTitle icon="people" meta={status === 'ready' ? `${people.length} / 50` : undefined}>
        {t('Друзья')}
      </ScreenTitle>

      <button className="btn btn-primary btn-lg w-full" onClick={invite}>
        {t('Пригласить друга')}
      </button>
      <p className="subtle">
        {t(
          'За каждого приглашённого друга — бонус к деньгам и лимиту друзей. Отношения с персонажами меняют прогулки, общение и события.'
        )}
      </p>

      {/* D2: связи как ресурс — стат и три одноразовые траты */}
      <div className="card space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SectionTitle>{t('Связи')}</SectionTitle>
          <ResChip tone="blue">
            {t('Связи')}: {player?.contacts ?? 0}
          </ResChip>
          {!!player?.recommendation && <ResChip tone="gold">{t('Рекомендация активна')}</ResChip>}
          {!!player?.freelanceLead && <ResChip tone="gold">{t('Лид активен')}</ResChip>}
          {!!player?.p2pDiscount && <ResChip tone="gold">{t('Скидка активна')}</ResChip>}
        </div>
        <p className="subtle">
          {t('Знакомства и мероприятия дают связи. Связи открываются в нужный момент: собеседование, заказ, покупка.')}
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="btn btn-sm btn-secondary"
            disabled={using !== null || !!player?.recommendation || (player?.contacts ?? 0) < RECOMMENDATION_COST}
            onClick={() => useContact('use_recommendation')}
          >
            <PixelIcon name="briefcase" size={11} /> {t('Рекомендация')} · {RECOMMENDATION_COST}
          </button>
          <button
            className="btn btn-sm btn-secondary"
            disabled={using !== null || !!player?.freelanceLead || (player?.contacts ?? 0) < FREELANCE_LEAD_COST}
            onClick={() => useContact('use_freelance_lead')}
          >
            <PixelIcon name="target" size={11} /> {t('Лид')} · {FREELANCE_LEAD_COST}
          </button>
          <button
            className="btn btn-sm btn-secondary"
            disabled={using !== null || !!player?.p2pDiscount || (player?.contacts ?? 0) < P2P_DISCOUNT_COST}
            onClick={() => useContact('use_p2p_discount')}
          >
            <PixelIcon name="bag" size={11} /> {t('Скидка')} · {P2P_DISCOUNT_COST}
          </button>
        </div>
      </div>

      {status === 'loading' && <Spinner label={t('Загрузка знакомых…')} />}

      {status === 'error' && (
        <div role="alert" className="card">
          <p className="text-sm text-clay-300">{t('Не удалось загрузить знакомых.')}</p>
          <button className="btn btn-secondary w-full mt-3" onClick={() => setAttempt((n) => n + 1)}>
            {t('Повторить загрузку')}
          </button>
        </div>
      )}

      {status === 'ready' && people.length === 0 && (
        <EmptyState
          icon="people"
          title={t('Пока никого нет')}
          hint={t('Приглашай друзей и получай бонусы — вместе карьера растёт быстрее.')}
        >
          <button className="btn btn-primary mt-4" onClick={invite}>
            {t('Пригласить')}
          </button>
        </EmptyState>
      )}

      {status === 'ready' && people.length > 0 && (
        <>
          <SectionTitle>{t('Список')}</SectionTitle>
          <div className="space-y-2">
            {people.map((person) => {
              const relation = player?.relationships?.[person.id] ?? person.initialRelation ?? 0;
              // npcs.json ships the source filename; we serve the optimised WebP twin.
              const portrait = person.avatar ? `/art/npcs/${person.avatar.replace(/\.png$/i, '.webp')}` : null;
              const open = openId === person.id;
              return (
                <article className="friend-row" key={person.id} aria-label={person.name}>
                  {portrait ? (
                    <img
                      className="friend-portrait"
                      src={portrait}
                      width={48}
                      height={48}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <PixelIcon name="code" size={14} />
                  )}
                  <div className="friend-copy">
                    <h3>{person.name}</h3>
                    <p>
                      {relationLabel(relation)} ·{' '}
                      <span className="num">
                        {relation > 0 ? '+' : ''}
                        {relation}
                      </span>
                    </p>
                    {/* D1.4: чип показывает ЭФФЕКТ порога, а не только слово «Друг» */}
                    {relationEffectLabelKey(person.id, relation) !== '' && (
                      <p className="mt-1">
                        <ResChip tone={relation >= 30 ? 'positive' : relation < 0 ? 'negative' : 'neutral'}>
                          {t(relationEffectLabelKey(person.id, relation))}
                        </ResChip>
                      </p>
                    )}
                    {open && <p className="mt-1 text-ink-400">{person.description}</p>}
                    {/* D1: действие живёт в колонке копии — на 320px колонка кнопок распирает ряд */}
                    <button
                      className="btn btn-sm btn-primary w-full mt-1.5"
                      title={t('3 энергии')}
                      disabled={
                        spending !== null || spentTimeToday(player ?? {}, person.id) || (player?.energy ?? 0) < 3
                      }
                      onClick={() => spendTime(person.id)}
                    >
                      <PixelIcon name="bolt" size={11} />{' '}
                      {spentTimeToday(player ?? {}, person.id) ? t('Виделись сегодня') : t('Провести время')}
                    </button>
                  </div>
                  <div className="friend-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => setOpenId(open ? null : person.id)}>
                      {open ? t('Скрыть') : t('Профиль')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <button className="btn btn-secondary w-full" onClick={() => setView('main')}>
        {t('К действиям дня')}
      </button>
    </div>
  );
};
