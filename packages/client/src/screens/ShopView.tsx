import React from 'react';
import { useGameStore } from '../store/gameStore';

const SHOP_ITEMS = [
  { id: 'gaming_chair', name: 'Кресло для гейминга', icon: '🪑', price: 15000, desc: '+1 к энергии', effect: '+1 ⚡' },
  { id: 'herman_miller', name: 'Herman Miller Aeron', icon: '💺', price: 120000, desc: '+2 к энергии', effect: '+2 ⚡' },
  { id: 'cheap_headphones', name: 'Дешёвые наушники', icon: '🎧', price: 2000, desc: '+5% к XP', effect: '+5% XP' },
  { id: 'sony_headphones', name: 'Sony WH-1000XM5', icon: '🎧', price: 30000, desc: '+15% к XP', effect: '+15% XP' },
  { id: 'coffee_maker', name: 'Кофемашина', icon: '☕', price: 25000, desc: '+2 энергии, +3 мотивации', effect: '+2 ⚡, +3 🔥' },
  { id: 'gaming_pc', name: 'Игровой ПК', icon: '🖥️', price: 80000, desc: '+20% скорость, +5% XP', effect: '+20% 🚀' },
  { id: 'macbook', name: 'MacBook Pro', icon: '💻', price: 200000, desc: '+30% скорость, +10% XP', effect: '+30% 🚀' },
  { id: 'desk_plant', name: 'Кактус на стол', icon: '🌵', price: 500, desc: '+2 мотивации', effect: '+2 🔥' },
  { id: 'mechanical_keyboard', name: 'Механическая клавиатура', icon: '⌨️', price: 8000, desc: '+5% XP', effect: '+5% XP' },
];

export const ShopView: React.FC = () => {
  const player = useGameStore((s) => s.player);

  if (!player) return null;

  const canAfford = (price: number) => (player.money ?? 0) >= price;
  const alreadyOwned = (id: string) => (player.items ?? []).includes(id);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">🏪 Магазин</h2>
        <span className="text-sm text-emerald-400">{formatMoney(player.money ?? 0)}</span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SHOP_ITEMS.map((item) => {
          const owned = alreadyOwned(item.id);
          const affordable = canAfford(item.price);

          return (
            <div
              key={item.id}
              className={`game-card flex items-center gap-3 ${
                owned ? 'border-emerald-500/30' : affordable ? 'border-slate-600' : 'border-slate-700/50 opacity-60'
              }`}
            >
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{item.name}</span>
                  {owned && <span className="text-xs text-emerald-400">✅</span>}
                </div>
                <p className="text-xs text-slate-500">{item.desc}</p>
                <p className="text-xs text-primary-400">{item.effect}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-emerald-400 font-mono">{formatMoney(item.price)}</div>
                {!owned && (
                  <button
                    disabled={!affordable}
                    className={`mt-1 text-xs px-3 py-1 rounded ${
                      affordable
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Купить
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Housing section */}
      <div className="game-card mt-4">
        <h3 className="text-sm font-medium text-slate-400 mb-2">🏠 Жильё</h3>
        <div className="space-y-2">
          {[
            { level: 0, name: 'Общага', cost: 5000, bonus: 'базовое' },
            { level: 1, name: 'Однушка на окраине', cost: 25000, bonus: '+1 ⚡' },
            { level: 2, name: 'Квартира в центре', cost: 50000, bonus: '+2 ⚡, +5 🔥' },
            { level: 3, name: 'Ипотека', cost: 40000, bonus: '+2 ⚡, +10 🔥' },
            { level: 4, name: 'Пентхаус', cost: 150000, bonus: '+3 ⚡, +15 🔥, +10 ⭐' },
          ].map((h) => {
            const current = player.housingLevel === h.level;
            return (
              <div
                key={h.level}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  current ? 'bg-emerald-800/20 border border-emerald-500/30' : 'bg-slate-800/50'
                }`}
              >
                <div>
                  <span className={`text-sm ${current ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {current ? '📍 ' : ''}{h.name}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">{h.bonus}</span>
                </div>
                <span className="text-xs text-slate-400">{formatMoney(h.cost)}/мес</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс`;
  return `${amount}`;
}