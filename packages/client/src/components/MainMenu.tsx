import React from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { IsoRoom } from './iso/IsoRoom';
import { PixelIcon } from './pixel/PixelIcon';
import { PixelText } from './pixel/PixelText';

export const MainMenu: React.FC = () => {
  const { setScreen, setView, player } = useGameStore();

  const hasProgress = player && (player.currentDay ?? 1) > 1;



  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[300px]">
        {/* Hero — your own room with you standing in it */}
        <div className="w-full animate-fade-in">
          {player ? (
            <IsoRoom player={player} />
          ) : (
            <div className="aspect-[4/3] rounded-xl border border-ink-700 bg-ink-800" />
          )}
        </div>

        {/* Wordmark */}
        <h1 className="flex flex-col items-center gap-2 mt-6">
          <PixelText scale={4} className="text-gold-300">
            IT LIFE
          </PixelText>
          <span className="text-2xs font-semibold uppercase tracking-[0.42em] text-ink-500 pl-1">
            Simulator
          </span>
        </h1>

        {/* One line of context: where you left off, or what this is */}
        {hasProgress ? (
          <p className="flex items-center gap-2 text-xs text-ink-400 mt-4">
            <span className="num">День {player.currentDay}</span>
            <span className="text-ink-700">·</span>
            <span className="text-ink-200 font-semibold">{gradeLabel(player.grade)}</span>
            <span className="text-ink-700">·</span>
            <span className="num text-moss-300 font-semibold">{formatMoney(player.money ?? 0)}</span>
          </p>
        ) : (
          <p className="text-ink-400 text-sm max-w-[30ch] text-center mt-4 leading-relaxed">
            Карьера, навыки, деньги и попытка не выгореть.
          </p>
        )}

        {/* The only action on this screen */}
        <button
          onClick={() => {
            haptic('medium');
            setScreen('game');
          }}
          className="btn btn-primary w-full text-base mt-6"
        >
          <PixelIcon name="play" size={13} />
          {hasProgress ? `Продолжить · день ${player.currentDay}` : 'Начать игру'}
        </button>

        {/* Quiet shortcuts, only once there is something to look at */}
        {hasProgress && (
          <div className="flex items-center gap-5 mt-4">
            <MenuLink
              icon="house"
              label="Мой дом"
              onClick={() => {
                setView('room');
                setScreen('game');
              }}
            />
            <span className="w-px h-3 bg-ink-700" />
            <MenuLink
              icon="chart"
              label="Топ игроков"
              onClick={() => {
                setView('leaderboard');
                setScreen('game');
              }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-2xs text-ink-600 tracking-[0.04em]">
        <p>v2.0.0 · Telegram Mini App</p>
      </div>
    </div>
  );
};

const MenuLink: React.FC<{ icon: string; label: string; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    onClick={() => {
      haptic('selection');
      onClick();
    }}
    className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200 transition-colors min-h-[44px]"
  >
    <PixelIcon name={icon} size={11} className="text-ink-500" />
    {label}
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
