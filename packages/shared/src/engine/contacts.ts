import { PlayerState } from '../types';
import { clamp } from './utils';

/**
 * D2 «Связи как ресурс» (25.10.2026).
 *
 * `contacts` — стат знакомств: растёт от мероприятий и друзей, тратится на
 * три одноразовых баффа (рекомендация на вакансию, лид фриланса, скидка P2P).
 * Кап маленький, рост медленный — это стратегический ресурс, а не валюта.
 */

/** Потолок «кармана связей». */
export const CONTACTS_CAP = 20;

/** «Провести время с другом»: +1 — знакомишься в кругу друга. */
export const CONTACTS_FRIEND_TIME = 1;

/** «Рекомендация на вакансию»: гарантированный исход текущего собеседования. */
export const RECOMMENDATION_COST = 10;

/** «Лид фриланса»: следующий отклик получает +FREELANCE_LEAD_BONUS шанса. */
export const FREELANCE_LEAD_COST = 6;

/** Скидка P2P: следующая покупка у игрока — на P2P_DISCOUNT_RATE дешевле. */
export const P2P_DISCOUNT_COST = 5;

/** Бонус тёплого лида к bidChance (0.3 = +30 п.п.), потолок отклика — 0.95. */
export const FREELANCE_LEAD_BONUS = 0.3;
export const FREELANCE_LEAD_CAP = 0.95;

/** Доля скидки по связям (0.25 = −25%). Продавцу уходит полная цена. */
export const P2P_DISCOUNT_RATE = 0.25;

export function contactsOf(p: Pick<PlayerState, 'contacts'>): number {
  return clamp(Math.round(p.contacts ?? 0), 0, CONTACTS_CAP);
}

/** Мутабельное начисление с капом (как прочие числовые эффекты движка). */
export function addContacts(p: PlayerState, delta: number): void {
  p.contacts = clamp(Math.round((p.contacts ?? 0) + delta), 0, CONTACTS_CAP);
}

/** Трата: true — хватило (списали), false — не хватило (ничего не трогаем). */
export function spendContacts(p: PlayerState, cost: number): boolean {
  const have = contactsOf(p);
  if (have < cost) return false;
  p.contacts = have - cost;
  return true;
}
