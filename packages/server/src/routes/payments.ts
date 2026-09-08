import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';

import { config } from '../config.js';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import { getContent } from '../services/contentService.js';
import {
  createStarsInvoiceLink,
  answerPreCheckoutQuery,
  sendMessage,
  isBotConfigured,
} from '../services/telegramApi.js';
import {
  grantPurchase,
  hasProduct,
  purchasesOf,
  purchasesToday,
} from '../services/entitlements.js';

/**
 * Telegram Stars monetization.
 *
 * The catalogue lives in content (`monetization.json`, validated as
 * "cosmetics / banked days / badges only"), the invoice is created through the
 * Bot API, and the webhook is authenticated with the secret token Telegram
 * echoes in `X-Telegram-Bot-Api-Secret-Token`.
 *
 * What changed vs. the MVP mock: the invoice link is real, the webhook verifies
 * the caller, pre-checkout is answered (without it Telegram cancels the
 * payment), and granting is idempotent per `telegram_payment_charge_id`.
 */

const PAYLOAD_PREFIX = 'itsim:v1';

export function buildPayload(userId: string, productId: string): string {
  return `${PAYLOAD_PREFIX}:${userId}:${productId}:${randomUUID().slice(0, 8)}`;
}

export function parsePayload(payload: string): { userId: string; productId: string } | null {
  const parts = String(payload ?? '').split(':');
  if (parts.length < 4 || `${parts[0]}:${parts[1]}` !== PAYLOAD_PREFIX) return null;
  return { userId: parts[2], productId: parts[3] };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function products(): any[] {
  return getContent().monetization?.products ?? [];
}

function findProduct(id: string): any | null {
  return products().find((p) => p.id === id) ?? null;
}

/** Why this user cannot buy this product right now (null = they can). */
export function purchaseBlocker(userId: string, product: any): string | null {
  if (!product.repeatable && hasProduct(userId, product.id)) return 'Уже куплено';
  if (product.dailyLimit && purchasesToday(userId, product.id) >= product.dailyLimit) {
    return `Лимит на сегодня: ${product.dailyLimit}`;
  }
  return null;
}

export async function paymentRoutes(app: FastifyInstance) {
  /**
   * GET /api/payments/products — catalogue + what the caller already owns
   */
  app.get('/products', { preHandler: telegramAuthHook }, async (request) => {
    const userId = String((request as any).telegramUser.id);
    const monetization = getContent().monetization ?? { currency: 'XTR', products: [] };

    return {
      currency: monetization.currency ?? 'XTR',
      policy: monetization.policy ?? null,
      mock: !isBotConfigured(),
      products: products().map((product) => ({
        ...product,
        owned: hasProduct(userId, product.id),
        blocked: purchaseBlocker(userId, product),
      })),
      purchases: purchasesOf(userId),
    };
  });

  /**
   * POST /api/payments/stars — create a Telegram Stars invoice link
   */
  app.post('/stars', { preHandler: telegramAuthHook }, async (request, reply) => {
    const userId = String((request as any).telegramUser.id);
    const { productId } = (request.body ?? {}) as { productId?: string };

    const product = productId ? findProduct(productId) : null;
    if (!product) return reply.status(400).send({ error: 'Unknown productId' });

    const blocker = purchaseBlocker(userId, product);
    if (blocker) return reply.status(409).send({ error: blocker });

    const payload = buildPayload(userId, product.id);

    if (!isBotConfigured()) {
      // Dev/mock mode: no Bot API available. Return a link the client can show
      // and (if enabled) a token for /dev-complete to simulate the purchase.
      return {
        mock: true,
        invoiceLink: `${config.miniAppUrl}?mock_invoice=${encodeURIComponent(product.id)}`,
        payload,
        devComplete: config.allowMockPayments ? '/api/payments/dev-complete' : null,
      };
    }

    const result = await createStarsInvoiceLink({
      title: product.title,
      description: product.description,
      payload,
      stars: product.stars,
    });

    if (!result.ok || !result.result) {
      return reply.status(502).send({ error: result.description ?? 'Telegram declined the invoice' });
    }

    return { mock: false, invoiceLink: result.result, payload };
  });

  /**
   * POST /api/payments/webhook — Telegram update endpoint for payments.
   *
   * Authentication: the `secret_token` passed to setWebhook is echoed back in
   * every request; without a match we do not even parse the body.
   */
  app.post('/webhook', async (request, reply) => {
    if (!config.telegramWebhookSecret) {
      return reply.status(503).send({ error: 'Webhook not configured (TELEGRAM_WEBHOOK_SECRET is empty)' });
    }
    const provided = String(request.headers['x-telegram-bot-api-secret-token'] ?? '');
    if (!provided || !safeEqual(provided, config.telegramWebhookSecret)) {
      request.log.warn('Rejected payment webhook with a bad secret token');
      return reply.status(401).send({ error: 'Invalid secret token' });
    }

    const update = (request.body ?? {}) as any;

    // 1. Pre-checkout: Telegram gives us ~10 seconds to approve the charge.
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const parsed = parsePayload(query.invoice_payload);
      const product = parsed ? findProduct(parsed.productId) : null;
      const buyerId = String(query.from?.id ?? '');

      let error: string | null = null;
      if (!parsed || !product) error = 'Товар недоступен';
      else if (parsed.userId !== buyerId) error = 'Счёт выписан другому игроку';
      else error = purchaseBlocker(buyerId, product);

      await answerPreCheckoutQuery(query.id, !error, error ?? undefined);
      return { ok: true, approved: !error };
    }

    // 2. Successful payment: grant once per charge id.
    const payment = update.message?.successful_payment;
    if (payment) {
      const parsed = parsePayload(payment.invoice_payload);
      const product = parsed ? findProduct(parsed.productId) : null;
      const buyerId = String(update.message.from?.id ?? parsed?.userId ?? '');

      if (!parsed || !product || !buyerId) {
        request.log.error({ payload: payment.invoice_payload }, 'Unrecognised successful_payment');
        return { ok: true, granted: false };
      }

      const result = grantPurchase({
        chargeId: payment.telegram_payment_charge_id,
        userId: buyerId,
        product,
      });

      if (result.granted) {
        request.log.info(
          { userId: buyerId, product: product.id, stars: product.stars },
          'Stars purchase granted'
        );
        await sendMessage(
          buyerId,
          `✅ Спасибо! Покупка «${product.title}» активирована.\n${result.applied.join('\n') || 'Загляни в игру.'}`
        );
      }

      return { ok: true, granted: result.granted, duplicate: result.duplicate };
    }

    return { ok: true, ignored: true };
  });

  /**
   * POST /api/payments/dev-complete — simulate a purchase locally.
   * Only available when ALLOW_MOCK_PAYMENTS is on (default: no BOT_TOKEN).
   */
  app.post('/dev-complete', { preHandler: telegramAuthHook }, async (request, reply) => {
    if (!config.allowMockPayments) {
      return reply.status(403).send({ error: 'Mock payments are disabled' });
    }
    const userId = String((request as any).telegramUser.id);
    const { productId } = (request.body ?? {}) as { productId?: string };
    const product = productId ? findProduct(productId) : null;
    if (!product) return reply.status(400).send({ error: 'Unknown productId' });

    const blocker = purchaseBlocker(userId, product);
    if (blocker) return reply.status(409).send({ error: blocker });

    const result = grantPurchase({
      chargeId: `mock_${randomUUID()}`,
      userId,
      product,
      mock: true,
    });

    return { ok: true, granted: result.granted, applied: result.applied, record: result.record };
  });
}
