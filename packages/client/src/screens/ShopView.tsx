import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState, EmojiToken } from '../components/ui';
import { StarsShop } from '../components/StarsShop';
import { PixelIcon } from '../components/pixel/PixelIcon';

const HOUSING = [
  { level: 0, name: 'Общага', cost: 5000, bonus: 'базовое' },
  { level: 1, name: 'Однушка на окраине', cost: 25000, bonus: '+1 энергия' },
  { level: 2, name: 'Квартира в центре', cost: 50000, bonus: '+2 энергия, +5 мотивация' },
  { level: 3, name: 'Ипотека', cost: 40000, bonus: '+2 энергия, +10 мотивация' },
  { level: 4, name: 'Пентхаус', cost: 150000, bonus: '+3 энергия, +15 мотивация, +10 репутация' },
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
  const [loaded, setLoaded] = useState(false);
  const [roomManifest, setRoomManifest] = useState<any>(null);
  const [avatarManifest, setAvatarManifest] = useState<any>(null);

  useEffect(() => {
    fetch('/api/content/items')
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setItems([]);
        setLoaded(true);
      });
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <PixelIcon name="bag" size={14} className="text-gold-300" />
          Магазин
        </h2>
        <span className="num text-sm font-semibold text-moss-300">
          {formatMoney(player.money ?? 0)}
        </span>
      </div>

      <StarsShop />

      {!loaded && <Spinner label="Открываем магазин…" />}
      {loaded && items.length === 0 && (
        <EmptyState
          icon="bag"
          title="Полки пустые"
          hint="Не удалось загрузить товары. Проверь соединение и зайди позже."
        />
      )}
      <div className="grid grid-cols-1 gap-3">
        {items.map((item) => {
          const owned = alreadyOwned(item.id);
          const affordable = canAfford(item.price);
          const visual = layerVisual(item.layerId);

          return (
            <div
              key={item.id}
              className={`panel flex items-center gap-3 ${
                owned ? 'panel-note panel-note-moss' : affordable ? '' : 'opacity-55'
              }`}
            >
              {visual ? (
                <img
                  src={`/layers/${visual.file}`}
                  alt=""
                  draggable={false}
                  className="w-14 h-14 rounded-lg border border-ink-700 bg-ink-900 object-cover shrink-0 select-none pixelated"
                />
              ) : (
                <span className="w-14 shrink-0 flex justify-center">
                  <EmojiToken className="!w-11 !h-11 !text-[18px]">
                    {TYPE_ICONS[item.type] ?? '📦'}
                  </EmojiToken>
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink-100">{item.name}</span>
                  {owned && <PixelIcon name="check" size={10} className="text-moss-400" />}
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">{item.description}</p>
                {(visual || item.nft) && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {visual && (
                      <span className="chip">
                        {visual.where === 'room' ? 'в комнату' : 'на персонажа'}
                      </span>
                    )}
                    {item.nft && (
                      <span className="chip !text-gold-300 !border-gold-700">NFT</span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="num text-sm font-semibold text-ink-100">{formatMoney(item.price)}</div>
                {!owned && (
                  <button
                    disabled={!affordable}
                    onClick={() => performAction('buy_item', { itemId: item.id })}
                    className={`btn mt-1.5 !min-h-[36px] !px-4 text-sm ${
                      affordable ? 'btn-primary' : 'btn-secondary'
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
        <h3 className="section-title mb-2">Жильё</h3>
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
                className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${
                  current ? 'border-moss-700 bg-moss-900/25' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {bgEntry?.file && (
                    <img
                      src={`/layers/${bgEntry.file}`}
                      alt=""
                      draggable={false}
                      className="w-10 h-10 rounded-md border border-ink-700 bg-ink-900 object-cover shrink-0 select-none pixelated"
                    />
                  )}
                  <div className="min-w-0">
                    <span
                      className={`text-sm ${current ? 'text-moss-300 font-medium' : 'text-ink-200'}`}
                    >
                      {h.name}
                    </span>
                    <span className="text-xs text-ink-500 ml-2">{h.bonus}</span>
                    {!current && (
                      <span className="block text-2xs text-ink-600 mt-0.5">меняет фон комнаты</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-xs text-ink-400">{formatMoney(h.cost)}/мес</span>
                  {isNext && !current && (
                    <button
                      disabled={!affordable}
                      onClick={() => performAction('upgrade_housing')}
                      className={`btn !min-h-[34px] !px-3 text-xs ${
                        affordable ? 'btn-primary' : 'btn-secondary'
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
