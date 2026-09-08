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

export const SHOP_CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'equipment', label: 'Техника' },
  { id: 'home', label: 'Для дома' },
  { id: 'pets', label: 'Питомцы' },
  { id: 'courses', label: 'Курсы' },
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number]['id'];

export function itemCategory(item: ShopItem): ShopCategory {
  if (item.type === 'pet') return 'pets';
  if (item.type === 'course') return 'courses';
  if (
    ['pc', 'headphones'].includes(item.type) ||
    item.id.startsWith('mining_') ||
    ['mechanical_keyboard', 'solar_panel'].includes(item.id)
  )
    return 'equipment';
  return 'home';
}

const EFFECT_LABELS: Record<string, [string, boolean]> = {
  speedBonus: ['скорость', true],
  xpBonus: ['опыт', true],
  energyBonus: ['энергия', false],
  motivationBonus: ['мотивация', false],
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
