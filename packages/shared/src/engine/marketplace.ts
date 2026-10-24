/**
 * Торговая площадка редких питомцев (роадмап «Деньги и рост») — v1:
 * витрина с ежедневной подборкой редких питомцев от «продавцов».
 *
 * Подборка детерминирована (seed = игрок + реальный день): повторный заход
 * в тот же день видит те же листинги, купить «втихую» дважды нельзя. P2P-
 * торговля между игроками — отдельной стадией (нужен эскроу и антифрод).
 *
 * День — реальный (UTC), как у недельных спринтов: «загляни завтра».
 */
import { seededRng } from './utils.js';

export interface MarketListing {
  itemId: string;
  price: number;
  rarity: string;
}

export interface MarketPoolItem {
  itemId: string;
  weight: number;
}

export interface MarketItemDef {
  id: string;
  price: number;
  rarity?: string;
}

/** Реальный день (UTC) — ротация витрины. */
export function marketDay(now: number): number {
  return Math.floor(now / 86_400_000);
}

/**
 * Подборка дня: `count` уникальных позиций из пула, взвешенно без возврата.
 * `items` — определения предметов (цены/редкость), `pool` — конфиг площадки.
 */
export function marketplaceListings(
  items: MarketItemDef[],
  pool: MarketPoolItem[],
  count: number,
  seed: string
): MarketListing[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rng = seededRng(`market:${seed}`);
  const remaining = pool.filter((o) => byId.has(o.itemId) && o.weight > 0).slice();
  const out: MarketListing[] = [];
  while (out.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, o) => sum + o.weight, 0);
    let roll = rng() * total;
    let idx = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      roll -= remaining[i].weight;
      if (roll < 0) {
        idx = i;
        break;
      }
    }
    const [offer] = remaining.splice(idx, 1);
    const item = byId.get(offer.itemId)!;
    out.push({ itemId: item.id, price: item.price, rarity: item.rarity ?? 'rare' });
  }
  return out;
}
