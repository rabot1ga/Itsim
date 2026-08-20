import { FastifyInstance } from 'fastify';

export async function paymentRoutes(app: FastifyInstance) {
  /**
   * POST /api/payments/stars
   * Create Telegram Stars invoice
   */
  app.post('/stars', async (request, reply) => {
    const { itemId } = request.body as { itemId?: string };

    // MVP mock
    return {
      invoiceLink: `https://t.me/$ITSIM_BOT/start?invoice=${itemId}`,
      itemId,
    };
  });

  /**
   * POST /api/payments/webhook
   * Telegram payment confirmation webhook
   */
  app.post('/webhook', async (request, reply) => {
    const body = request.body as any;

    // Validate webhook (simplified)
    if (body?.telegram_payment_charge_id) {
      console.log(`Payment received: ${body.telegram_payment_charge_id}`);
    }

    return { ok: true };
  });
}