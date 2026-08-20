import React from 'react';
import { useGameStore } from '../store/gameStore';

export const MainMenu: React.FC = () => {
  const { setScreen } = useGameStore();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center mb-8 animate-fade-in">
        <div className="text-6xl mb-4">💻</div>
        <h1 className="text-3xl font-bold text-white mb-2">
          IT Life Simulator
        </h1>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          Симулятор жизни IT-специалиста. Начинай карьеру, качай навыки, избегай выгорания.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3 animate-fade-in">
        <button
          onClick={() => setScreen('game')}
          className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors text-lg"
        >
          🚀 Начать игру
        </button>

        <button className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors">
          📊 Лидерборд
        </button>

        <button className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors">
          🏪 Магазин
        </button>

        <button className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors">
          ⚙️ Настройки
        </button>
      </div>

      <div className="mt-8 text-center text-xs text-slate-600">
        <p>v2.0.0 • Telegram Mini App</p>
        <p className="mt-1">Сделано с ❤️ для айтишников</p>
      </div>
    </div>
  );
};