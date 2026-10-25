import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle } from '../components/ui';
import { ACTIONS } from './actionCatalogue';
import {
  ROOM_TIER_META,
  PET_ROOM_META,
  DEFAULT_PET_POSITION,
  housingTitle,
  roomArtwork,
  roomTierOf,
} from '../lib/roomArt';
import { PET_SKIN_EMOJI, petEmoji, petBadges, petAnimState } from '../lib/petSkins';
import type { PetRoomPosition } from '@itsim/shared';
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
  { id: 'kitchen', emoji: '🍲', label: t('Нормально поесть'), action: 'rest_lunch' },
  { id: 'cat', emoji: '🐈', label: t('Покормить кота'), action: 'feed_pet', needsPet: true },
];
function zoneChips(zone: Zone): string[] {
  if (zone.chip) return [zone.chip];
  const def = ACTIONS.find((a) => a.id === zone.action);
  const chips: string[] = [];
  if (def?.energy) chips.push(`−${def.energy}`);
  if (def?.cost) chips.push(`−${def.cost} ₽`);
  return chips;
}
export const RoomView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const setPetRoom = useGameStore((s) => s.setPetRoom);
  const [busy, setBusy] = useState<string | null>(null);
  if (!player) return null;
  // Дом растёт с жильём (24.10.2026): переезд меняет сцену комнаты.
  const tier = roomTierOf(player.housingLevel ?? 0);
  const meta = ROOM_TIER_META[tier];
  const items = player.items ?? [];
  // Скины и позиции питомца (роадмап): вид — эмоудзи по виду питомца,
  // аксессуары — бейджем; позиция — якорь на сцене комнаты. Старые сейвы
  // могли получить косметику только в entitlements — читаем объединение.
  const owned = [...new Set<string>([...items, ...((player.entitlements as string[] | undefined) ?? [])])];
  const ownedSkins = owned.filter((i: string) => i in PET_SKIN_EMOJI);
  const hasPet = ownedSkins.length > 0;
  const zones = ZONES.filter((z) => !z.needsPet || hasPet);
  const look = player.petRoom ?? {};
  const skin = look.skin === null ? null : (look.skin ?? ownedSkins[0] ?? null);
  const position: PetRoomPosition = look.position ?? DEFAULT_PET_POSITION;
  const anchor = PET_ROOM_META[position];
  const skinEmo = petEmoji(skin);
  const badges = petBadges(owned);
  // Анимации питомца (роадмап): idle/sleep/happy — из состояния дня.
  const anim = petAnimState(player);
  const runZone = async (zone: Zone) => {
    setBusy(zone.id);
    await performAction(zone.action);
    setBusy(null);
  };
  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle icon="house" meta={<span className="num">{meta.tagline}</span>}>
        {t('Дом')}
      </ScreenTitle>

      <section className="story-card" aria-label={t('Твоя комната')}>
        <div className="story-card-kicker">
          {t('твой дом ·')} {housingTitle(player.housingLevel ?? 0)}
        </div>
        <div className="room-pet-stage">
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
          {skinEmo && (
            <div
              className={`room-pet room-pet--${anim}`}
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              role="img"
              aria-label={anim === 'sleep' ? t('Питомец спит') : t('Питомец в комнате')}
            >
              <span className="room-pet-emoji">{skinEmo}</span>
              {badges.length > 0 && (
                <span className="room-pet-badges" aria-hidden="true">
                  {badges.join('')}
                </span>
              )}
              {anim === 'sleep' && (
                <span className="room-pet-zzz" aria-hidden="true">
                  💤
                </span>
              )}
              {anim === 'happy' && (
                <span className="room-pet-spark" aria-hidden="true">
                  ✨
                </span>
              )}
            </div>
          )}
        </div>
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

      {/* Скины и позиции питомца в комнате (роадмап): косметика сейва */}
      {ownedSkins.length > 0 && (
        <section className="card">
          <SectionTitle>{t('Питомец в комнате')}</SectionTitle>
          <p className="pet-room-label">{t('Кто в комнате')}</p>
          <div className="pet-room-row" role="group" aria-label={t('Кто в комнате')}>
            {ownedSkins.map((id: string) => (
              <button
                key={id}
                type="button"
                className={skin === id ? 'btn btn-primary' : 'btn btn-ghost'}
                aria-pressed={skin === id}
                onClick={() => void setPetRoom({ skin: id })}
              >
                <span aria-hidden="true">{PET_SKIN_EMOJI[id]}</span>
              </button>
            ))}
            <button
              type="button"
              className={skin === null ? 'btn btn-primary' : 'btn btn-ghost'}
              aria-pressed={skin === null}
              onClick={() => void setPetRoom({ skin: null })}
            >
              {t('Убрать питомца')}
            </button>
          </div>
          <p className="pet-room-label">{t('Где отдыхает питомец')}</p>
          <div className="pet-room-row" role="group" aria-label={t('Где отдыхает питомец')}>
            {(Object.keys(PET_ROOM_META) as PetRoomPosition[]).map((p) => (
              <button
                key={p}
                type="button"
                className={position === p ? 'btn btn-primary' : 'btn btn-ghost'}
                aria-pressed={position === p}
                onClick={() => void setPetRoom({ position: p })}
              >
                {PET_ROOM_META[p].label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
