import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';

/**
 * GET /api/admin/products — Stars-каталог для бота (sendInvoice из чата):
 * только позиция/цена, без грантов; доступ — по ADMIN_TOKEN, иначе 503/401.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'itsim-admin-products-'));
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

async function buildApp() {
  vi.resetModules();
  process.env.DATA_DIR = DATA_DIR;
  process.env.ADMIN_TOKEN = 'test-admin-token';
  const { adminRoutes } = await import('../routes/admin');
  const contentService = await import('../services/contentService');
  contentService.setContent({
    monetization: {
      currency: 'XTR',
      products: [
        {
          id: 'bank_slot',
          title: 'Слот',
          description: 'Описание',
          stars: 120,
          repeatable: true,
          grants: { bankSlots: 1 },
        },
      ],
    },
  } as any);
  const app = Fastify();
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
  return { app };
}

describe('admin products', () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it('отдаёт каталог без внутренних полей грантов', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/products',
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    expect(res.statusCode).toBe(200);
    const products = res.json().products;
    expect(products).toEqual([{ id: 'bank_slot', title: 'Слот', description: 'Описание', stars: 120 }]);
    expect(products[0].grants).toBeUndefined();
  });

  it('без/с чужим токеном — отказ', async () => {
    const { app } = await buildApp();
    const none = await app.inject({ method: 'GET', url: '/api/admin/products' });
    expect(none.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'GET',
      url: '/api/admin/products',
      headers: { 'x-admin-token': 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
  });
});
