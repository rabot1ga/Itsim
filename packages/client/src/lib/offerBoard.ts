/**
 * Витрина P2P: чистые функции поиска/фильтра/сортировки объявлений и
 * плюрализации счётчика сделок — мгновенный UI поверх готовой выдачи
 * `GET /game/marketplace/offers`.
 */
export interface BoardOffer {
  id: string;
  itemId: string;
  name: string;
  description: string;
  rarity: string;
  price: number;
  createdAt: number;
}

export type OfferSort = 'newest' | 'price_asc' | 'price_desc';

export interface BoardFilter {
  /** Подстрока по имени/описанию (без учёта регистра). */
  q?: string;
  /** 'all' | 'rare' | 'legendary' */
  rarity?: string;
  sort?: OfferSort;
}

export function filterBoardOffers<T extends BoardOffer>(offers: T[], filter: BoardFilter = {}): T[] {
  const q = (filter.q ?? '').trim().toLowerCase();
  const rarity = filter.rarity && filter.rarity !== 'all' ? filter.rarity : null;
  const out = offers.filter(
    (o) =>
      (!q || o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)) &&
      (!rarity || o.rarity === rarity)
  );
  const sort = filter.sort ?? 'newest';
  out.sort((a, b) =>
    sort === 'price_asc'
      ? a.price - b.price || b.createdAt - a.createdAt
      : sort === 'price_desc'
        ? b.price - a.price || b.createdAt - a.createdAt
        : b.createdAt - a.createdAt
  );
  return out;
}

/** Русская форма слова «сделка» для счётчика репутации: 1 сделка, 2 сделки, 5 сделок. */
export function dealCountWord(n: number): '{p0} сделка' | '{p0} сделки' | '{p0} сделок' {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return '{p0} сделка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return '{p0} сделки';
  return '{p0} сделок';
}
