import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { EmptyState, ScreenTitle, SectionTitle } from '../components/ui';
import { ACTIONS } from './actionCatalogue';
import { ROOM_TIER_META, roomArtwork, roomTierOf } from '../lib/roomArt';

/**
 * «Дом» — комната как карточка события (решение 22.10.2026, вариант B):
 * сцена-баннер текущего тира + строки-зоны поверх общего каталога действий.
 * Конструктора комнаты и пиксельной идентичности здесь больше нет: сцена
 * одна на тир, протагонист в ней постоянный, кастомизации нет вовсе.
 * Кошелёк и NFT-мок ниже доживают до захода «снятие идентичности» (v5).
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
  { id: 'bed', emoji: '🛏️', label: 'Проспать до утра', action: 'rest_sleep', chip: 'день завершится' },
  { id: 'window', emoji: '🚶', label: 'Прогулка вокруг дома', action: 'rest_walk' },
  { id: 'rug', emoji: '🎲', label: 'Хобби на коврике', action: 'rest_hobby' },
  { id: 'desk', emoji: '💻', label: 'Рабочая задача за своим столом', action: 'work_task', needsJob: true },
  { id: 'shelf', emoji: '📚', label: 'Книга с полки', action: 'study_book' },
  { id: 'cat', emoji: '🐈', label: 'Покормить кота', action: 'feed_pet', needsPet: true },
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
  const bindWallet = useGameStore((s) => s.bindWallet);
  const inventory = useGameStore((s) => s.inventory);

  const [walletInput, setWalletInput] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);
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

  const handleBind = async () => {
    const ok = await bindWallet(walletInput.trim());
    setWalletError(ok ? null : 'Не удалось привязать кошелёк (проверь формат base58)');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="🏠" meta={<span className="num truncate max-w-[140px]">{meta.tagline}</span>}>
        Дом
      </ScreenTitle>

      <section className="story-card" aria-label="Твоя комната">
        <div className="story-card-kicker">твоя комната · {tier}</div>
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
            const missing = zone.needsJob && !player.job ? ['нужна работа'] : [];
            return (
              <div className="story-choice-group" key={zone.id}>
                <button
                  className="story-choice story-choice-green"
                  disabled={busy !== null || missing.length > 0}
                  onClick={() => runZone(zone)}
                >
                  <span>
                    <span aria-hidden="true">{zone.emoji}</span> {busy === zone.id ? 'Делаем…' : zone.label}
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
        <p className="story-footnote">Комната растёт вместе с грейдом: старт → обжитая → офис → студия мечты.</p>
      </section>

      {/* Кошелёк и NFT-мок: уйдут следующим заходом вместе с пиксельной
          идентичностью (решение 22.10.2026, docs/PROPOSALS-2026-10-22-room-redesign.md). */}
      <div className="card">
        <SectionTitle className="mb-3">Кошелёк Solana</SectionTitle>
        {player.walletAddress ? (
          <p className="num text-xs text-moss-300 break-all">{player.walletAddress}</p>
        ) : (
          <div className="flex gap-2">
            <input
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              placeholder="Base58 адрес…"
              className="input flex-1 min-w-0"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <button onClick={handleBind} disabled={walletInput.trim().length < 32} className="btn btn-primary shrink-0">
              Привязать
            </button>
          </div>
        )}
        {walletError && (
          <p className="story-error" role="alert">
            {walletError}
          </p>
        )}
      </div>

      <div className="card">
        <SectionTitle className="mb-3">NFT-предметы (мок)</SectionTitle>
        {(inventory ?? []).length === 0 ? (
          <EmptyState bare emoji="📦" title="NFT пока нет" hint="Загляни в магазин — покупка смонтится в кошелёк." />
        ) : (
          <div className="space-y-1.5">
            {(inventory ?? []).map((nft: any) => (
              <div key={nft.name} className="well flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-ink-100">{nft.name}</p>
                  <p className="num text-2xs text-ink-500 truncate">
                    {nft.attributes?.map((a: any) => `${a.trait_type}:${a.value}`).join(' · ')}
                  </p>
                </div>
                <span className="num text-2xs text-sky-300">{nft.symbol}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
