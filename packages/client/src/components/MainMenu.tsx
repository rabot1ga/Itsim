import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { RoomRenderer, buildRoomComposition } from './room/RoomRenderer';
import { buildAvatarData, fetchPixelPack, PixelAvatarData } from './room/pixelAvatar';
import { PixelIcon } from './pixel/PixelIcon';
import { PixelText } from './pixel/PixelText';

export const MainMenu: React.FC = () => {
  const { setScreen, setView, player } = useGameStore();

  const hasProgress = player && (player.currentDay ?? 1) > 1;

  // Personal hero: the player's own room + avatar, rendered by the game engine.
  const [roomManifest, setRoomManifest] = useState<any>(null);
  const [avatarManifest, setAvatarManifest] = useState<any>(null);
  const [geneticsConfig, setGeneticsConfig] = useState<any>(null);
  const [pixelPack, setPixelPack] = useState<Awaited<ReturnType<typeof fetchPixelPack>>>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/layers').then((r) => r.json()),
      fetchPixelPack(),
    ])
      .then(([l, pixel]) => {
        setRoomManifest(l.room);
        setAvatarManifest(l.avatar);
        setPixelPack(pixel);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/content/genetics')
      .then((r) => r.json())
      .then((g) => setGeneticsConfig(g.genetics))
      .catch(() => {});
  }, []);

  const traits = player?.genetics;
  const displayTraits =
    traits && player?.room?.wallColor ? { ...traits, wallColor: player.room.wallColor } : traits;
  const heroReady = roomManifest && avatarManifest && geneticsConfig && displayTraits;
  const heroComposition = heroReady
    ? buildRoomComposition({
        traits: displayTraits,
        housingLevel: player.housingLevel ?? 0,
        items: player.items ?? [],
        crossLayers: [],
        custom: player.room,
      })
    : null;
  const heroAvatar: PixelAvatarData | null =
    pixelPack && traits ? buildAvatarData(pixelPack, traits, player?.avatar) : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">
        {/* Hero — your own room, or the classic laptop while it loads */}
        <div className="text-center mb-6 animate-fade-in w-full">
          {heroReady && heroComposition ? (
            <div className="max-w-[280px] mx-auto mb-4">
              <RoomRenderer
                roomManifest={roomManifest}
                avatarManifest={avatarManifest}
                traits={displayTraits}
                geneticsConfig={geneticsConfig}
                housingLevel={player.housingLevel ?? 0}
                composition={heroComposition}
                pixelAvatar={heroAvatar}
                avatarCustom={player.avatar}
                petWear={(player.items ?? []).filter((id: string) =>
                  ['pet_bow', 'pet_glasses', 'pet_crown'].includes(id)
                )}
                petFed={!!player.petFedToday}
              />
            </div>
          ) : (
            <div className="max-w-[280px] mx-auto mb-4 aspect-square rounded-xl border border-ink-700 bg-ink-800" />
          )}
          <h1 className="flex flex-col items-center gap-2">
            <PixelText scale={4} className="text-gold-300">
              IT LIFE
            </PixelText>
            <span className="text-2xs font-semibold uppercase tracking-[0.42em] text-ink-500 pl-1">
              Simulator
            </span>
          </h1>
          <p className="text-ink-400 text-sm max-w-[32ch] mx-auto mt-3 leading-relaxed">
            {hasProgress
              ? `С возвращением. День ${player.currentDay}, ${gradeLabel(player.grade).toLowerCase()}.`
              : 'Симулятор жизни айтишника: карьера, навыки, деньги и попытка не выгореть.'}
          </p>
        </div>

        {/* Player progress summary */}
        {hasProgress && (
          <div className="w-full panel mb-4 animate-pop-in !py-2.5 mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-ink-400">
                <PixelIcon name="calendar" size={12} className="text-ink-500" />
                <span className="num">День {player.currentDay}</span>
              </span>
              <span className="text-ink-200 font-semibold uppercase tracking-[0.06em] text-2xs">
                {gradeLabel(player.grade)}
              </span>
              <span className="num text-moss-300 font-semibold">
                {formatMoney(player.money ?? 0)}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="w-full space-y-3 animate-fade-in">
          <button
            onClick={() => {
              haptic('medium');
              setScreen('game');
            }}
            className="btn btn-primary w-full text-base"
          >
            <PixelIcon name="play" size={13} />
            {hasProgress ? 'Продолжить игру' : 'Начать игру'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            <MenuTile
              icon="chart"
              label="Лидерборд"
              onClick={() => {
                setView('leaderboard');
                setScreen('game');
              }}
            />
            <MenuTile
              icon="house"
              label="Мой дом"
              onClick={() => {
                setView('room');
                setScreen('game');
              }}
            />
            <MenuTile icon="gear" label="Настройки" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-2xs text-ink-600 tracking-[0.04em]">
        <p>v2.0.0 · Telegram Mini App</p>
      </div>
    </div>
  );
};

const MenuTile: React.FC<{ icon: string; label: string; onClick?: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    onClick={() => {
      if (onClick) haptic('selection');
      onClick?.();
    }}
    disabled={!onClick}
    className="tile flex flex-col items-center justify-center gap-2 min-h-[68px]"
  >
    <PixelIcon name={icon} size={18} className="text-ink-300" />
    <span className="text-2xs text-ink-400 font-medium">{label}</span>
  </button>
);

function gradeLabel(grade: string): string {
  const labels: Record<string, string> = {
    unemployed: 'Без работы',
    intern: 'Стажёр',
    junior: 'Junior',
    middle: 'Middle',
    senior: 'Senior',
    teamlead: 'Teamlead',
    architect: 'Архитектор',
    cto: 'CTO',
  };
  return labels[grade] ?? grade;
}

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}
