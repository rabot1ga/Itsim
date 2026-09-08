export interface ShopItem {
  id: string;
  name: string;
  type: string;
  price: number;
  description: string;
  effects?: Record<string, number>;
  layerId?: string;
  nft?: boolean;
}

/**
 * Shop tab as authored in `balance.shop.categories[]` (3.7).
 *
 * - `match: 'all'`         — virtual "Все" tab; no filtering applied
 * - `match: string[]`      — list of `Item.type` values covered
 * - `matchIds: string[]`   — explicit item ids
 * - `matchPrefixes: string[]` — id prefix matches (e.g. `mining_`)
 */
export interface ShopCategoryDef {
  id: string;
  label: string;
  match: 'all' | string[];
  matchIds?: string[];
  matchPrefixes?: string[];
}

/** UI shape is the same — a tab strip with a label per id. */
export const SHOP_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'equipment', label: 'Техника' },
  { id: 'home', label: 'Для дома' },
  { id: 'pets', label: 'Питомцы' },
  { id: 'courses', label: 'Курсы' },
] as const;
export type ShopCategory = string;

/** Map balance.shop.categories to the local shape (label, no extra fields). */
export function shopCategoriesFromBalance(
  list: ReadonlyArray<ShopCategoryDef> | undefined
): ReadonlyArray<{ id: string; label: string }> {
  if (!list || list.length === 0) return SHOP_CATEGORIES;
  return list.map((c) => ({ id: c.id, label: c.label }));
}

/** Does an item belong to a category? The first matching tab wins. */
export function itemInCategory(
  item: ShopItem,
  category: ShopCategory,
  catalogue: ReadonlyArray<ShopCategoryDef> | undefined
): boolean {
  if (category === 'all') return true;
  // No content yet → fall back to the local heuristic.
  if (!catalogue || catalogue.length === 0) {
    return itemCategoryLocal(item) === category;
  }
  const def = catalogue.find((c) => c.id === category);
  if (!def) return true;
  if (def.match === 'all') return true;
  if (def.matchIds?.includes(item.id)) return true;
  if (def.matchPrefixes?.some((p) => item.id.startsWith(p))) return true;
  if (Array.isArray(def.match) && def.match.includes(item.type)) return true;
  return false;
}

/** Internal fallback used when balance hasn't loaded yet. */
function itemCategoryLocal(item: ShopItem): string {
  if (item.type === 'pet') return 'pets';
  if (item.type === 'course') return 'courses';
  if (
    ['pc', 'headphones'].includes(item.type) ||
    item.id.startsWith('mining_') ||
    ['mechanical_keyboard', 'solar_panel'].includes(item.id)
  ) {
    return 'equipment';
  }
  return 'home';
}

const EFFECT_LABELS: Record<string, [string, boolean]> = {
  speedBonus: ['скорость', true],
  xpBonus: ['опыт', true],
  energyBonus: ['энергия', false],
  motivationBonus: ['настроение', false],
  healthBonus: ['здоровье', false],
  hashrate: ['MH/s', false],
  electricitySave: ['экономия электричества', true],
};

/** Numbers come from content, never from a reference mockup. */
export function itemEffects(item: ShopItem): string {
  const labels = Object.entries(item.effects ?? {}).flatMap(([key, value]) => {
    const spec = EFFECT_LABELS[key];
    if (!spec || !Number.isFinite(value) || value === 0) return [];
    const n = spec[1] ? Math.round(value * 100) : value;
    return [`${n > 0 ? '+' : ''}${n}${spec[1] ? '%' : ''} ${spec[0]}`];
  });
  return labels.join(' · ') || 'Без пассивного бонуса';
}

export const shopMoney = (amount: number): string => `${amount.toLocaleString('ru-RU')} ₽`;
