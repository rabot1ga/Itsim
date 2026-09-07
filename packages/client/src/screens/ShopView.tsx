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
  pet: '🐾',
  other: '📦',
};

interface ShopItem {
  id: string;
  name: string;
  type: string;
  price: number;
  description: string;
  icon: string;
  layerId?: string;
  nft?: boolean;
}

export const ShopView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [roomManifest, setRoomManifest] = useState<any>(null);
  const [avatarManifest, setAvatarManifest] = useState<any>(null);

  useEffect(() => {
    fetch('/api/content/items')
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]));
    // Layer manifests power the "how it looks" thumbnails (DESIGN.md 3.2: layerId)
    fetch('/api/content/layers')
      .then((r) => r.json())
      .then((data) => {
        setRoomManifest(data.room ?? null);
        setAvatarManifest(data.avatar ?? null);
      })
      .catch(() => {});
  }, []);

  /** Find the visual for an item's layerId across room + avatar manifests. */
  const layerVisual = (layerId?: string): { file: string; where: 'room' | 'avatar' } | null => {
    if (!layerId) return null;
    for (const [manifest, where] of [
      [roomManifest, 'room'],
      [avatarManifest, 'avatar'],
    ] as const) {
      const slot = manifest?.slots?.find((s: any) => s.entries?.some((e: any) => e.id === layerId));
      const entry = slot?.entries?.find((e: any) => e.id === layerId);
      if (entry?.file) return { file: entry.file, where };
    }
    return null;
  };

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
          const visual = layerVisual(item.layerId);

          return (
            <div
              key={item.id}
              className={`game-card flex items-center gap-3 ${
                owned ? 'border-emerald-500/30' : affordable ? 'border-slate-600' : 'border-slate-700/50 opacity-60'
              }`}
            >
              {visual ? (
                <img
                  src={`/layers/${visual.file}`}
                  alt=""
                  draggable={false}
                  className="w-14 h-14 rounded-xl border border-slate-700 bg-slate-800 object-cover shrink-0 select-none"
                />
              ) : (
                <span className="text-2xl w-14 text-center shrink-0">{TYPE_ICONS[item.type] ?? '📦'}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{item.name}</span>
                  {owned && <span className="text-xs text-emerald-400">✅</span>}
                </div>
                <p className="text-xs text-slate-500">{item.description}</p>
                {(visual || item.nft) && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {visual && (
                      <span className="chip bg-primary-900/50 text-primary-300 border border-primary-700/40">
                        {visual.where === 'room' ? '🎨 в комнату' : '🧍 на персонажа'}
                      </span>
                    )}
                    {item.nft && (
                      <span className="chip bg-amber-900/40 text-amber-300 border border-amber-700/40">
                        🔗 NFT
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-emerald-400 font-mono">{formatMoney(item.price)}</div>
                {!owned && (
                  <button
                    disabled={!affordable}
                    onClick={() => performAction('buy_item', { itemId: item.id })}
                    className={`mt-1.5 text-sm px-4 py-2 rounded-xl touch-target font-medium transition-all ${
                      affordable
                        ? 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
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
        <h3 className="section-title mb-2">🏠 Жильё</h3>
        <div className="space-y-2">
          {HOUSING.map((h) => {
            const current = player.housingLevel === h.level;
            const isNext = player.housingLevel + 1 === h.level;
            const affordable = canAfford(h.cost);
            const bgEntry = roomManifest?.slots
              ?.find((s: any) => s.id === 'bg')
              ?.entries?.find((e: any) => e.id === `bg_${h.level}`);
            return (
              <div
                key={h.level}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  current ? 'bg-emerald-800/20 border border-emerald-500/30' : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {bgEntry?.file && (
                    <img
                      src={`/layers/${bgEntry.file}`}
                      alt=""
                      draggable={false}
                      className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-800 object-cover shrink-0 select-none"
                    />
                  )}
                  <div className="min-w-0">
                    <span className={`text-sm ${current ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {current ? '📍 ' : ''}{h.name}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">{h.bonus}</span>
                    {!current && (
                      <span className="block text-[10px] text-primary-400 mt-0.5">🎨 меняет фон комнаты</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatMoney(h.cost)}/мес</span>
                  {isNext && !current && (
                    <button
                      disabled={!affordable}
                      onClick={() => performAction('upgrade_housing')}
                      className={`text-xs px-4 py-2 rounded-xl touch-target font-medium transition-all ${
                        affordable
                          ? 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
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
