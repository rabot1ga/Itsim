/**
 * Торговая площадка редких питомцев (роадмап «Деньги и рост»).
 *
 *   - GET  /api/game/marketplace              — витрина дня (детерминирована по игроку и UTC-дню)
 *   - POST /api/game/marketplace/buy          — купить позицию витрины (₽ из сейва)
 *   - GET  /api/game/marketplace/offers       — P2P-объявления игроков + мои
 *   - POST /api/game/marketplace/sell         — выставить питомца (эскроу-лок)
 *   - POST /api/game/marketplace/offers/:id/buy    — купить объявление
 *   - POST /api/game/marketplace/offers/:id/payout — продавец забирает деньги из эскроу
 *   - POST /api/game/marketplace/offers/:id/cancel — снять объявление (питомец возвращается)
 *
 * Витрина — косметика и настроение (политика монетизации), деньги игровые.
 * P2P-эскроу-лайт (24.10.2026): питомец и деньги сидят в записи объявления;
 * антифрод v1 — ценовой коридор, лимит объявлений, запрет самопокупки,
 * попытки мимо правил пишутся в журнал аномалий.
 */
import { randomUUID } from 'node:crypto';
import { t } from '../../lib/i18n';
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState, __offerBackend } from '../../services/gameStore.js';
import { logAnomaly } from '../../services/anomalyLog.js';
import {
  marketplaceListings,
  marketDay,
  offerPriceBounds,
  isOfferPriceAllowed,
  isSellerRating,
  OFFER_TTL_MS,
  MAX_ACTIVE_OFFERS,
} from '@itsim/shared';
import type { OfferRecord } from '../../services/storeTypes.js';
import { respondState, StoredState, MUTATION_RATE_LIMIT } from './shared.js';
import { P2P_DISCOUNT_RATE } from '@itsim/shared';

function listingsOf(userId: string) {
  const content = getContent();
  const day = marketDay(Date.now());
  const listings = marketplaceListings(
    content.items,
    content.marketplace?.pool ?? [],
    content.marketplace?.listingsPerDay ?? 0,
    `${userId}:${day}`
  );
  return { day, listings };
}

export async function marketplaceRoutes(app: FastifyInstance) {
  /** GET /api/game/marketplace — витрина дня + что уже в коллекции. */
  app.get('/marketplace', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const state = (await loadState(userId)) as StoredState | null;
    const { day, listings } = listingsOf(userId);
    const owned = new Set(state?.items ?? []);
    const itemById = new Map((getContent().items as any[]).map((i) => [i.id, i]));
    return {
      day,
      listings: listings.map((l) => {
        const item = itemById.get(l.itemId) as any;
        return {
          ...l,
          name: item?.name ?? l.itemId,
          description: item?.description ?? '',
          owned: owned.has(l.itemId),
        };
      }),
      policy: t('Редкие питомцы — косметика и настроение. Новая подборка — каждый день.'),
    };
  });

  /** POST /api/game/marketplace/buy — купить позицию сегодняшней витрины. */
  app.post('/marketplace/buy', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { itemId } = request.body as { itemId?: string };
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) return reply.status(404).send({ error: t('Game not started') });
    const { listings } = listingsOf(userId);
    const listing = listings.find((l) => l.itemId === itemId);
    if (!listing) return reply.status(400).send({ error: t('Сегодня такой позиции нет на витрине') });
    if ((state.items ?? []).includes(listing.itemId)) {
      return reply.status(400).send({ error: t('Уже в твоей коллекции') });
    }
    if ((state.money ?? 0) < listing.price) {
      return reply.status(400).send({ error: t('Не хватает денег') });
    }
    const item = (getContent().items as any[]).find((i) => i.id === listing.itemId);
    state.money = (state.money ?? 0) - listing.price;
    state.items = [...(state.items ?? []), listing.itemId];
    await saveState(userId, state);
    return {
      state: respondState(state, t('{p0} теперь живёт у тебя дома', { p0: item?.name ?? listing.itemId })),
    };
  });

  // ---------------- P2P-витрина (эскроу-лайт) ----------------

  const offerView = (o: OfferRecord, itemById: Map<string, any>, viewerId: string) => {
    const item = itemById.get(o.itemId) as any;
    return {
      id: o.id,
      itemId: o.itemId,
      name: item?.name ?? o.itemId,
      description: item?.description ?? '',
      rarity: item?.rarity ?? 'rare',
      price: o.price,
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      status: o.status,
      own: o.sellerId === viewerId,
    };
  };

  /** Сделка состоялась: покупатель забрал питомца (деньги ещё могут ждать выплаты). */
  const isDeal = (o: OfferRecord) => o.status === 'sold_escrow' || o.status === 'paid_out';

  /** Репутация продавца: сделки + средний балл оценок (null — оценок ещё нет). */
  const repOf = (deals: OfferRecord[]): { deals: number; rating: number | null } => {
    const rated = deals.filter((o) => o.buyerRating != null);
    return {
      deals: deals.length,
      rating: rated.length ? rated.reduce((s, o) => s + (o.buyerRating ?? 0), 0) / rated.length : null,
    };
  };

  /** Ленивый свип истёкших объявлений: питомец возвращается продавцу. */
  const sweepExpiredOffers = async (): Promise<void> => {
    const store = __offerBackend();
    const now = Date.now();
    for (const o of await store.listActive()) {
      if (o.expiresAt > now) continue;
      o.status = 'expired';
      await store.put(o);
      const seller = (await loadState(o.sellerId)) as StoredState | null;
      if (seller) {
        if (!(seller.items ?? []).includes(o.itemId)) seller.items = [...(seller.items ?? []), o.itemId];
        await saveState(o.sellerId, seller);
      }
    }
  };

  /** GET /api/game/marketplace/offers — витрина P2P: объявления, мои, история и репутация. */
  app.get('/marketplace/offers', async (request) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    await sweepExpiredOffers();
    const store = __offerBackend();
    const itemById = new Map((getContent().items as any[]).map((i) => [i.id, i]));
    const active = (await store.listActive()).filter((o) => o.sellerId !== userId);
    const mineAll = await store.bySeller(userId);
    const mine = mineAll.filter((o) => o.status !== 'active');
    const myActive = mineAll.filter((o) => o.status === 'active');

    // Репутация продавца — сделки + средний балл (анонимно, без имён).
    const sellerRep: Record<string, { deals: number; rating: number | null }> = {};
    for (const sid of new Set(active.map((o) => o.sellerId))) {
      sellerRep[sid] = repOf((await store.bySeller(sid)).filter(isDeal));
    }
    const myRep = repOf(mineAll.filter(isDeal));

    // История моих сделок (куплено/продано), новые сверху; rating — моя оценка
    // продавца (для «куплено») или полученная (для «продано»).
    const history = [...mineAll.filter(isDeal), ...(await store.byBuyer(userId)).filter(isDeal)]
      .sort((a, b) => (b.soldAt ?? b.createdAt) - (a.soldAt ?? a.createdAt))
      .map((o) => {
        const item = itemById.get(o.itemId) as any;
        return {
          id: o.id,
          itemId: o.itemId,
          name: item?.name ?? o.itemId,
          price: o.price,
          role: o.sellerId === userId ? 'sold' : 'bought',
          at: o.soldAt ?? o.createdAt,
          settled: o.status === 'paid_out',
          rating: o.buyerRating ?? null,
        };
      });

    return {
      offers: active.map((o) => ({
        ...offerView(o, itemById, userId),
        rep: sellerRep[o.sellerId]?.deals ?? 0,
        rating: sellerRep[o.sellerId]?.rating ?? null,
      })),
      mine: [...myActive, ...mine].map((o) => offerView(o, itemById, userId)),
      history,
      myRep: myRep.deals,
      myRating: myRep.rating,
    };
  });

  /** POST /api/game/marketplace/sell — выставить питомца на продажу. */
  app.post('/marketplace/sell', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { itemId, price } = request.body as { itemId?: string; price?: number };
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) return reply.status(404).send({ error: t('Game not started') });
    const item = (getContent().items as any[]).find((i) => i.id === itemId);
    if (!item || item.type !== 'pet' || !(state.items ?? []).includes(item.id)) {
      return reply.status(400).send({ error: t('Такого питомца у тебя нет') });
    }
    if (!item.price) {
      return reply.status(400).send({ error: t('Эксклюзив Stars не продаётся') });
    }
    const { min, max } = offerPriceBounds(item.price);
    if (!isOfferPriceAllowed(item.price, price ?? 0)) {
      logAnomaly(userId, [
        { code: 'offer_price_out_of_corridor', detail: `${item.id} price=${price} outside [${min}, ${max}]` },
      ]);
      return reply.status(400).send({ error: t('Цена вне коридора ({p0}–{p1} ₽)', { p0: min, p1: max }) });
    }
    const store = __offerBackend();
    const myActive = (await store.bySeller(userId)).filter((o) => o.status === 'active');
    if (myActive.length >= MAX_ACTIVE_OFFERS) {
      return reply
        .status(400)
        .send({ error: t('Слишком много активных объявлений (максимум {p0})', { p0: MAX_ACTIVE_OFFERS }) });
    }
    const now = Date.now();
    const offer: OfferRecord = {
      id: randomUUID(),
      sellerId: userId,
      itemId: item.id,
      price: Math.round(price!),
      createdAt: now,
      expiresAt: now + OFFER_TTL_MS,
      status: 'active',
    };
    await store.put(offer);
    // Эскроу-лок: на время объявления питомец вычитается из сейва продавца.
    state.items = (state.items ?? []).filter((i) => i !== item.id);
    await saveState(userId, state);
    return {
      state: respondState(state, t('{p0} выставлен на продажу за {p1}', { p0: item.name, p1: Math.round(price!) })),
    };
  });

  /** POST /api/game/marketplace/offers/:id/buy — купить объявление игрока. */
  app.post('/marketplace/offers/:id/buy', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { id } = request.params as { id: string };
    await sweepExpiredOffers();
    const store = __offerBackend();
    const offer = await store.get(id);
    if (!offer) return reply.status(404).send({ error: t('Такого объявления нет') });
    if (offer.status !== 'active') return reply.status(400).send({ error: t('Объявление уже закрыто') });
    if (offer.sellerId === userId) {
      logAnomaly(userId, [{ code: 'offer_self_trade', detail: `offer=${offer.id}` }]);
      return reply.status(400).send({ error: t('Нельзя покупать у себя') });
    }
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) return reply.status(404).send({ error: t('Game not started') });
    if ((state.items ?? []).includes(offer.itemId)) {
      return reply.status(400).send({ error: t('Уже в твоей коллекции') });
    }
    // D2: скидка по связям — торг только для покупателя; продавцу из эскроу
    // уходит полная цена (разницу компенсирует игра, сделка не обманывает продавца).
    const usedDiscount = !!state.p2pDiscount;
    const payPrice = usedDiscount ? Math.ceil((offer.price * (1 - P2P_DISCOUNT_RATE)) / 10) * 10 : offer.price;
    if ((state.money ?? 0) < payPrice) {
      return reply.status(400).send({ error: t('Не хватает денег') });
    }
    const item = (getContent().items as any[]).find((i) => i.id === offer.itemId);
    if (usedDiscount) state.p2pDiscount = false;
    state.money = (state.money ?? 0) - payPrice;
    state.items = [...(state.items ?? []), offer.itemId];
    await saveState(userId, state);
    // Деньги остаются в записи объявления (эскроу) до payout продавца.
    offer.status = 'sold_escrow';
    offer.buyerId = userId;
    offer.soldAt = Date.now();
    await store.put(offer);
    return {
      state: respondState(
        state,
        usedDiscount
          ? t('Торг удался: {p0} теперь у тебя дома — по знакомству на {p1}% дешевле', {
              p0: item?.name ?? offer.itemId,
              p1: Math.round(P2P_DISCOUNT_RATE * 100),
            })
          : t('{p0} теперь живёт у тебя дома', { p0: item?.name ?? offer.itemId })
      ),
    };
  });

  /** POST /api/game/marketplace/offers/:id/payout — продавец забирает деньги из эскроу. */
  app.post('/marketplace/offers/:id/payout', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { id } = request.params as { id: string };
    const store = __offerBackend();
    const offer = await store.get(id);
    if (!offer || offer.sellerId !== userId) return reply.status(404).send({ error: t('Такого объявления нет') });
    if (offer.status !== 'sold_escrow') {
      return reply.status(400).send({ error: t('Деньги пока не в эскроу') });
    }
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) return reply.status(404).send({ error: t('Game not started') });
    state.money = (state.money ?? 0) + offer.price;
    await saveState(userId, state);
    offer.status = 'paid_out';
    await store.put(offer);
    const item = (getContent().items as any[]).find((i) => i.id === offer.itemId);
    return {
      state: respondState(state, t('Продажа «{p0}»: +{p1}', { p0: item?.name ?? offer.itemId, p1: offer.price })),
    };
  });

  /** POST /api/game/marketplace/offers/:id/cancel — снять объявление, питомец возвращается. */
  app.post('/marketplace/offers/:id/cancel', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { id } = request.params as { id: string };
    const store = __offerBackend();
    const offer = await store.get(id);
    if (!offer || offer.sellerId !== userId) return reply.status(404).send({ error: t('Такого объявления нет') });
    if (offer.status !== 'active') {
      return reply.status(400).send({ error: t('Объявление уже закрыто') });
    }
    const state = (await loadState(userId)) as StoredState | null;
    if (!state) return reply.status(404).send({ error: t('Game not started') });
    offer.status = 'cancelled';
    await store.put(offer);
    if (!(state.items ?? []).includes(offer.itemId)) state.items = [...(state.items ?? []), offer.itemId];
    await saveState(userId, state);
    const item = (getContent().items as any[]).find((i) => i.id === offer.itemId);
    return {
      state: respondState(state, t('↩ «{p0}» снят с продажи и вернулся к тебе', { p0: item?.name ?? offer.itemId })),
    };
  });

  /** POST /api/game/marketplace/offers/:id/rate — покупатель оценивает продавца (1–5, один раз). */
  app.post('/marketplace/offers/:id/rate', { config: { rateLimit: MUTATION_RATE_LIMIT } }, async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { id } = request.params as { id: string };
    const { stars } = request.body as { stars?: number };
    const store = __offerBackend();
    const offer = await store.get(id);
    if (!offer) return reply.status(404).send({ error: t('Такого объявления нет') });
    if (offer.buyerId !== userId) {
      logAnomaly(userId, [{ code: 'offer_rating_not_buyer', detail: `offer=${offer.id}` }]);
      return reply.status(404).send({ error: t('Такого объявления нет') });
    }
    if (!isDeal(offer)) return reply.status(400).send({ error: t('Сделка ещё не состоялась') });
    if (offer.buyerRating != null) return reply.status(400).send({ error: t('Оценка уже стоит') });
    if (!isSellerRating(stars ?? 0)) {
      return reply.status(400).send({ error: t('Оценка — целые звёзды от 1 до 5') });
    }
    offer.buyerRating = stars;
    await store.put(offer);
    return { ok: true, rating: stars };
  });
}
