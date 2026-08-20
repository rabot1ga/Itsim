import React from 'react';
import { useGameStore } from '../store/gameStore';

export const MainMenu: React.FC = () => {
  const { setScreen, player } = useGameStore();

  const hasProgress = player && (player.currentDay ?? 1) > 1;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">
        {/* Hero */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-7xl mb-4 animate-float drop-shadow-[0_8px_24px_rgba(56,189,248,0.35)]">💻</div>
          <h1 className="text-3xl font-black text-gradient animate-gradient">
            IT Life Simulator
          </h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2 leading-relaxed">
            Симулятор жизни IT-специалиста. Начинай карьеру, качай навыки, избегай выгорания.
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
            onClick={() => setScreen('game')}
            className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-500 hover:to-violet-500 text-white rounded-2xl font-bold transition-all text-lg shadow-lg shadow-primary-900/40 active:scale-[0.98]"
          >
            {hasProgress ? '▶️ Продолжить игру' : '🚀 Начать игру'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            <MenuTile icon="📊" label="Лидерборд" />
            <MenuTile icon="🏠" label="Мой дом" onClick={() => setScreen('game')} />
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
    onClick={onClick}
    className="game-card !p-3 flex flex-col items-center gap-1 hover:border-slate-500 transition-colors"
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
