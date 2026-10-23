import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle } from '../components/ui';
import { ACTIONS } from './actionCatalogue';
import { ROOM_TIER_META, roomArtwork, roomTierOf } from '../lib/roomArt';
/**
 * «Дом» — комната как карточка события (решение 22.10.2026, вариант B):
 * сцена-баннер текущего тира + строки-зоны поверх общего каталога действий.
 * Конструктора комнаты и пиксельной идентичности здесь больше нет: сцена
 * одна на тир, протагонист в ней постоянный, кастомизации нет вовсе.
 */
interface Zone {
  id: string;
  emoji: string;
  label: string;
  action: string;
  chip?: string;
  needsJob?: boolean;
  needsPet?: boolean;
}
const ZONES: Zone[] = [
  { id: 'bed', emoji: '🛏️', label: t('Проспать до утра'), action: 'rest_sleep', chip: t('день завершится') },
  { id: 'window', emoji: '🚶', label: t('Прогулка вокруг дома'), action: 'rest_walk' },
  { id: 'rug', emoji: '🎲', label: t('Хобби на коврике'), action: 'rest_hobby' },
  { id: 'desk', emoji: '💻', label: t('Рабочая задача за своим столом'), action: 'work_task', needsJob: true },
  { id: 'shelf', emoji: '📚', label: t('Книга с полки'), action: 'study_book' },
  { id: 'cat', emoji: '🐈', label: t('Покормить кота'), action: 'feed_pet', needsPet: true },
];
function zoneChips(zone: Zone): string[] {
  if (zone.chip) return [zone.chip];
  const def = ACTIONS.find((a) => a.id === zone.action);
  const chips: string[] = [];
  if (def?.energy) chips.push(`−${def.energy}⚡`);
  if (def?.cost) chips.push(`−${def.cost} ₽`);
  return chips;
}
export const RoomView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [busy, setBusy] = useState<string | null>(null);
  if (!player) return null;
  const tier = roomTierOf(player.grade);
  const meta = ROOM_TIER_META[tier];
  const hasPet = (player.items ?? []).some((i: string) => i.startsWith('pet_'));
  const zones = ZONES.filter((z) => !z.needsPet || hasPet);
  const runZone = async (zone: Zone) => {
    setBusy(zone.id);
    await performAction(zone.action);
    setBusy(null);
  };
  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="🏠" meta={<span className="num">{meta.tagline}</span>}>
        {t('Дом')}
      </ScreenTitle>

      <section className="story-card" aria-label={t('Твоя комната')}>
        <div className="story-card-kicker">
          {t('твоя комната ·')} {tier}
        </div>
        <img
          className="story-card-art"
          src={roomArtwork(tier)}
          alt=""
          width={512}
          height={384}
          onError={(ev) => {
            // Сцена — украшение и настроение, а не контракт: нет файла —
            // карточка остаётся текстовой (тот же приём, что у финалов).
            ev.currentTarget.style.display = 'none';
          }}
        />
        <div className="story-card-copy">
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="story-choices">
          {zones.map((zone) => {
            const missing = zone.needsJob && !player.job ? [t('нужна работа')] : [];
            return (
              <div className="story-choice-group" key={zone.id}>
                <button
                  className="story-choice story-choice-green"
                  disabled={busy !== null || missing.length > 0}
                  onClick={() => runZone(zone)}
                >
                  <span>
                    <span aria-hidden="true">{zone.emoji}</span> {busy === zone.id ? t('Делаем…') : zone.label}
                  </span>
                  <span className="story-choice-effects">
                    {zoneChips(zone).map((c) => (
                      <span key={c} className="res-chip num">
                        {c}
                      </span>
                    ))}
                  </span>
                </button>
                {missing.length > 0 && <p className="story-requirements">{missing.join(' · ')}</p>}
              </div>
            );
          })}
        </div>
        <p className="story-footnote">{t('Комната растёт вместе с грейдом: старт → обжитая → офис → студия мечты.')}</p>
      </section>
    </div>
  );
};
