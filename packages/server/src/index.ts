import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { config, assertProductionConfig } from './config.js';
import { initStorage } from './services/gameStore.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { paymentRoutes } from './routes/payments.js';
import { contentRoutes } from './routes/content.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { adminRoutes } from './routes/admin.js';
import { loadContent } from './services/contentService.js';
import { runWithLocale, requestLocale } from './lib/i18n.js';
import { translateDeep } from './lib/i18n.js';

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  // i18n (P2.5): каждый handler работает под локалью запроса — t() из
  // lib/i18n переводит сообщения ответа; параллельные запросы не смешиваются.
  app.addHook('onRoute', (route) => {
    const handler = route.handler as (this: unknown, request: unknown, reply: unknown) => unknown;
    route.handler = function (this: unknown, request, reply) {
      return runWithLocale(requestLocale(request as never), () => handler.call(this, request, reply));
    } as typeof handler;
  });

  // Контент-граница (P2.5, этап 3): всё, что уходит в JSON (контент-бандл,
  // сейв, ответы действий), переводится словарём под язык запроса. Строки без
  // перевода остаются исходными (fallback = ключ).
  app.addHook('onSend', (request, reply, payload, done) => {
    // onSend выполняется вне ALS-контекста хендлера — локаль берём из запроса.
    const locale = requestLocale(request);
    if (locale === 'ru') return done(null, payload);
    const contentType = String(reply.getHeader('content-type') ?? '');
    if (!contentType.includes('json') || typeof payload !== 'string') return done(null, payload);
    try {
      done(null, JSON.stringify(translateDeep(JSON.parse(payload), locale)));
    } catch {
      done(null, payload);
    }
  });

  // CORS for Telegram Mini App
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting (generous for dev/preview; per-IP глобально + per-user на мутациях)
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    // Игровые запросы идут от Telegram-юзеров за одним IP (прокси/мини-апп):
    // ключуем по пользователю, чтобы один не задел лимиты других.
    keyGenerator: (request: any) => String(request.telegramUser?.id ?? request.ip),
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: '2.0.0',
    mode: config.botToken ? 'telegram' : 'dev',
  }));

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(gameRoutes, { prefix: '/api/game' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(telemetryRoutes, { prefix: '/api/telemetry' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}

async function start() {
  // Fail fast on an insecure production environment (see .env.example)
  try {
    assertProductionConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Load and validate content at startup
  try {
    loadContent();
  } catch (err) {
    console.error('✗ Content validation failed:', (err as Error).message);
    process.exit(1);
  }

  // Storage backend (P2.6): JSON-файлы по умолчанию; STORAGE=postgres + DATABASE_URL
  // поднимает PostgreSQL через Prisma и прогоняет SQL-миграции.
  try {
    await initStorage();
  } catch (err) {
    console.error('✗ Storage init failed:', (err as Error).message);
    process.exit(1);
  }

  const app = await buildServer();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`✓ Server running on http://${config.host}:${config.port} (${config.nodeEnv})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// `node dist/index.js` starts the server; importing the module (tests) does not.
if (process.env.VITEST !== 'true') {
  start();
}
