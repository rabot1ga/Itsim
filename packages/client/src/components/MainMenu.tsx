import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { RoomRenderer, buildRoomComposition } from './room/RoomRenderer';
import { buildAvatarData, fetchPixelPack, PixelAvatarData } from './room/pixelAvatar';

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
            <div className="text-7xl mb-4 animate-float drop-shadow-[0_8px_24px_rgba(56,189,248,0.35)]">💻</div>
          )}
          <h1 className="text-3xl font-black text-gradient animate-gradient">
            IT Life Simulator
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2 leading-relaxed">
            {hasProgress
              ? `С возвращением! День ${player.currentDay} · ${gradeLabel(player.grade)}`
              : 'Симулятор жизни IT-специалиста. Начинай карьеру, качай навыки, избегай выгорания.'}
          </p>
        </div>

        {/* Player progress summary */}
        {hasProgress && (
          <div className="w-full game-card mb-4 animate-pop-in !py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">📅 День {player.currentDay}</span>
              <span className="text-slate-300 font-medium">{gradeLabel(player.grade)}</span>
              <span className="text-emerald-400 font-mono">{formatMoney(player.money ?? 0)}</span>
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
            className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-500 hover:to-violet-500 text-white rounded-2xl font-bold transition-all text-lg shadow-lg shadow-primary-900/40 active:scale-[0.98] touch-target"
          >
            {hasProgress ? '▶️ Продолжить игру' : '🚀 Начать игру'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            <MenuTile
              icon="📊"
              label="Лидерборд"
              onClick={() => {
                setView('leaderboard');
                setScreen('game');
              }}
            />
            <MenuTile
              icon="🏠"
              label="Мой дом"
              onClick={() => {
                setView('room');
                setScreen('game');
              }}
            />
            <MenuTile icon="⚙️" label="Настройки" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-600">
        <p>v2.0.0 • Telegram Mini App</p>
        <p className="mt-1">Сделано с ❤️ для айтишников</p>
      </div>
    </div>
  );
};

const MenuTile: React.FC<{ icon: string; label: string; onClick?: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={() => {
      if (onClick) haptic('selection');
      onClick?.();
    }}
    className="game-card !p-3 flex flex-col items-center justify-center gap-1 hover:border-slate-500 transition-all touch-target active:scale-95 min-h-[72px]"
  >
    <span className="text-xl">{icon}</span>
    <span className="text-[11px] text-slate-400">{label}</span>
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
