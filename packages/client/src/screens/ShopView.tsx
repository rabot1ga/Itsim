import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  SHOP_CATEGORIES,
  itemInCategory,
  itemEffects,
  shopCategoriesFromBalance,
  shopMoney,
  type ShopCategory,
  type ShopItem,
  type ShopCategoryDef,
} from './shopCatalogue';
import { Spinner, EmptyState, SpriteBadge } from '../components/ui';
import { StarsShop } from '../components/StarsShop';
import { IsoIcon, spriteForItem, HOUSING_SPRITE } from '../components/iso/IsoIcon';

type HousingDef = {
  level: number;
  name: string;
  cost: number;
  energyBonus: number;
  motivationBonus: number;
  reputationBonus: number;
  incomeGateMult: number;
  saveMult: number;
  saveStreakDays: number;
};

/** Compose the small "bonus" caption from the structured fields */
function housingBonus(h: HousingDef): string {
  const parts: string[] = [];
  if (h.energyBonus) parts.push(`+${h.energyBonus} энергия`);
  if (h.motivationBonus) parts.push(`+${h.motivationBonus} мотивация`);
  if (h.reputationBonus) parts.push(`+${h.reputationBonus} репутация`);
  return parts.length ? parts.join(', ') : 'базовое';
}

// Hard-coded fallback used only while /api/content/balance hasn't resolved.
// The values mirror balance.json so the section is never empty.
const FALLBACK_HOUSING: HousingDef[] = [
  { level: 0, name: 'Общага', cost: 5000, energyBonus: 0, motivationBonus: 0, reputationBonus: 0, incomeGateMult: 0, saveMult: 1, saveStreakDays: 0 },
  { level: 1, name: 'Однушка на окраине', cost: 25000, energyBonus: 1, motivationBonus: 0, reputationBonus: 0, incomeGateMult: 0, saveMult: 3, saveStreakDays: 25 },
  { level: 2, name: 'Квартира в центре', cost: 50000, energyBonus: 2, motivationBonus: 5, reputationBonus: 0, incomeGateMult: 0, saveMult: 6, saveStreakDays: 40 },
  { level: 3, name: 'Своя квартира (ипотека)', cost: 40000, energyBonus: 2, motivationBonus: 10, reputationBonus: 0, incomeGateMult: 18000, saveMult: 8, saveStreakDays: 55 },
  { level: 4, name: 'Пентхаус', cost: 150000, energyBonus: 3, motivationBonus: 15, reputationBonus: 10, incomeGateMult: 0, saveMult: 10, saveStreakDays: 70 },
];

export const ShopView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const error = useGameStore((s) => s.error);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState<ShopCategory>('equipment');
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  const [housing, setHousing] = useState<HousingDef[]>([]);
  const [shopCatalogue, setShopCatalogue] = useState<ShopCategoryDef[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoadError(false);
    fetch('/api/content/items', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('catalogue');
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data.items)) throw new Error('catalogue');
        setItems(data.items);
        setLoaded(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadError(true);
        setLoaded(true);
      });
    return () => controller.abort();
  }, [attempt]);

  // Housing comes from the same balance.json the server uses (3.6: HOUSING
  // moved out of a hard-coded array into content). We keep a local copy as a
  // graceful fallback in case the content service is down on first paint.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/content/balance', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = (data?.balance?.housing ?? []) as HousingDef[];
        if (list.length) setHousing(list);
        const cats = data?.balance?.shop?.categories as ShopCategoryDef[] | undefined;
        if (cats && cats.length) setShopCatalogue(cats);
      })
      .catch(() => {
        // keep fallback below
      });
    return () => controller.abort();
  }, []);

  const shopTabs = shopCatalogue ? shopCategoriesFromBalance(shopCatalogue) : SHOP_CATEGORIES;

  const HOUSING = housing.length > 0 ? housing : FALLBACK_HOUSING;

  const buy = async (id: string, action = 'buy_item') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setNote(null);
    try {
      const ok = await performAction(action, action === 'buy_item' ? { itemId: id } : undefined);
      if (ok) setNote(action === 'buy_item' ? 'Покупка сохранена. Предмет теперь твой.' : 'Переезд оформлен.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  if (!player) return null;
  const canAfford = (price: number) => (player.money ?? 0) >= price;
  const visible = items.filter((item) => itemInCategory(item, category, shopCatalogue ?? undefined));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="shop-heading">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <SpriteBadge sprite="boxes" size={32} />
          Магазин
        </h2>
        <span className="num text-sm font-semibold text-moss-300" aria-label="Доступно денег">
          {shopMoney(player.money ?? 0)}
        </span>
      </div>
      <div className="catalogue-filters" role="group" aria-label="Категории товаров">
        {shopTabs.map((tab) => (
          <button key={tab.id} aria-pressed={category === tab.id} onClick={() => setCategory(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      {note && (
        <p role="status" className="panel text-sm text-moss-300">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="panel text-sm text-clay-300">
          {error}
        </p>
      )}
      {!loaded && <Spinner label="Открываем магазин…" />}
      {loadError && (
        <div className="panel">
          <EmptyState icon="bag" title="Магазин недоступен" hint="Не удалось загрузить каталог. Попробуй ещё раз." />
          <button className="btn btn-secondary w-full" onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}
      {loaded && !loadError && visible.length === 0 && (
        <EmptyState icon="bag" title="Здесь пока пусто" hint="Загляни в другую категорию." />
      )}
      {loaded && !loadError && (
        <div className="grid grid-cols-1 gap-2" aria-label="Товары">
          {visible.map((item) => {
            const owned = (player.items ?? []).includes(item.id);
            const affordable = canAfford(item.price);
            return (
              <article key={item.id} className="panel shop-product" aria-label={item.name}>
                <span className="shop-product-art">
                  {item.type === 'headphones' ? (
                    <img src="/art/equipment/headphones.svg" alt="" width={48} height={48} />
                  ) : item.id === 'mechanical_keyboard' ? (
                    <img src="/art/equipment/keyboard.svg" alt="" width={64} height={40} />
                  ) : item.type === 'pc' || item.type === 'chair' ? (
                    <img
                      src={`/art/equipment/${item.type === 'pc' ? 'laptop' : 'chair'}.svg`}
                      alt=""
                      width={64}
                      height={64}
                    />
                  ) : (
                    <IsoIcon sprite={spriteForItem(item.id, item.type)} size={48} />
                  )}
                </span>
                <div className="shop-product-copy">
                  <h3>{item.name}</h3>
                  <p className="shop-product-effects">{itemEffects(item)}</p>
                  <details className="shop-product-details">
                    <summary>Описание{item.nft ? ' · NFT' : ''}</summary>
                    <p>{item.description}</p>
                  </details>
                </div>
                <div className="shop-product-buy">
                  {owned ? (
                    <span className="text-xs text-moss-300">✓ куплено</span>
                  ) : (
                    <>
                      <button
                        disabled={!affordable || busy !== null}
                        onClick={() => buy(item.id)}
                        className="shop-price-button"
                        aria-label="Купить"
                        title={
                          affordable
                            ? `Купить за ${shopMoney(item.price)}`
                            : `Не хватает ${shopMoney(item.price - (player.money ?? 0))}`
                        }
                      >
                        {busy === item.id ? 'Покупаем…' : shopMoney(item.price)}
                      </button>
                      {!affordable && (
                        <span className="sr-only">Не хватает {shopMoney(item.price - (player.money ?? 0))}</span>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <details className="panel shop-stars">
        <summary>Telegram Stars · косметика и поддержка</summary>
        <StarsShop />
      </details>

      {/* Housing section */}
      <div className="game-card mt-3">
        <h3 className="section-title mb-2">Жильё</h3>
        <p className="text-xs text-ink-400 mb-3">
          Указан месячный платёж. Для переезда нужны запас денег, стабильный доход и время накопления — условия проверит
          сервер.
        </p>
        <div className="space-y-2">
          {HOUSING.map((h) => {
            const current = player.housingLevel === h.level;
            const isNext = player.housingLevel + 1 === h.level;
            const affordable = canAfford(h.cost);
            return (
              <div
                key={h.level}
                className={`flex items-center justify-between gap-2 p-2 border ${
                  current ? 'border-moss-700 bg-moss-900/25' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-10 h-10 shrink-0 flex items-end justify-center bg-ink-900 border-2 border-ink-700 p-0.5">
                    <IsoIcon sprite={HOUSING_SPRITE[h.level] ?? 'bed'} size={34} />
                  </span>
                  <div className="min-w-0">
                    <span className={`text-sm ${current ? 'text-moss-300 font-medium' : 'text-ink-200'}`}>
                      {h.name}
                    </span>
                    <span className="text-xs text-ink-500 ml-2">{housingBonus(h)}</span>
                    {!current && <span className="block text-2xs text-ink-600 mt-0.5">меняет фон комнаты</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-xs text-ink-400">{shopMoney(h.cost)}/мес</span>
                  {isNext && !current && (
                    <button
                      disabled={!affordable || busy !== null}
                      onClick={() => buy('housing', 'upgrade_housing')}
                      className={`btn !min-h-[34px] !px-3 text-xs ${affordable ? 'btn-primary' : 'btn-secondary'}`}
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
