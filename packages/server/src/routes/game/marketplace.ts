/**
 * Торговая площадка редких питомцев (роадмап «Деньги и рост») — v1.
 *
 *   - GET  /api/game/marketplace      — витрина дня (детерминирована по игроку и UTC-дню)
 *   - POST /api/game/marketplace/buy  — купить позицию витрины (₽ из сейва)
 *
 * Витрина — косметика и настроение (политика монетизации), деньги игровые.
 * P2P-торговля — отдельной стадией (эскроу + антифрод).
 */
import { t } from '../../lib/i18n';
import { FastifyInstance } from 'fastify';
import { getContent } from '../../services/contentService.js';
import { loadState, saveState } from '../../services/gameStore.js';
import { marketplaceListings, marketDay } from '@itsim/shared';
import { respondState, StoredState, MUTATION_RATE_LIMIT } from './shared.js';

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
      state: respondState(state, t('🐾 {p0} теперь живёт у тебя дома', { p0: item?.name ?? listing.itemId })),
    };
  });
}
