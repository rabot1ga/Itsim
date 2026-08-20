import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

const HOUSING = [
  { level: 0, name: 'Общага', cost: 5000, bonus: 'базовое' },
  { level: 1, name: 'Однушка на окраине', cost: 25000, bonus: '+1 ⚡' },
  { level: 2, name: 'Квартира в центре', cost: 50000, bonus: '+2 ⚡, +5 🔥' },
  { level: 3, name: 'Ипотека', cost: 40000, bonus: '+2 ⚡, +10 🔥' },
  { level: 4, name: 'Пентхаус', cost: 150000, bonus: '+3 ⚡, +15 🔥, +10 ⭐' },
];

const TYPE_ICONS: Record<string, string> = {
  pc: '🖥️',
  chair: '🪑',
  headphones: '🎧',
  coffee: '☕',
  other: '📦',
};

interface ShopItem {
  id: string;
  name: string;
  type: string;
  price: number;
  description: string;
  icon: string;
}

export const ShopView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [items, setItems] = useState<ShopItem[]>([]);

  useEffect(() => {
    fetch('/api/content/items')
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]));
  }, []);

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
        {items.map((item) => {
          const owned = alreadyOwned(item.id);
          const affordable = canAfford(item.price);

          return (
            <div
              key={item.id}
              className={`game-card flex items-center gap-3 ${
                owned ? 'border-emerald-500/30' : affordable ? 'border-slate-600' : 'border-slate-700/50 opacity-60'
              }`}
            >
              <span className="text-2xl">{TYPE_ICONS[item.type] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{item.name}</span>
                  {owned && <span className="text-xs text-emerald-400">✅</span>}
                </div>
                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-emerald-400 font-mono">{formatMoney(item.price)}</div>
                {!owned && (
                  <button
                    disabled={!affordable}
                    onClick={() => performAction('buy_item', { itemId: item.id })}
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
          {HOUSING.map((h) => {
            const current = player.housingLevel === h.level;
            const isNext = player.housingLevel + 1 === h.level;
            const affordable = canAfford(h.cost);
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatMoney(h.cost)}/мес</span>
                  {isNext && !current && (
                    <button
                      disabled={!affordable}
                      onClick={() => performAction('upgrade_housing')}
                      className={`text-xs px-3 py-1 rounded ${
                        affordable
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Переехать
                    </button>
                  )}
                </div>
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
