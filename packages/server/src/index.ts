import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { config, assertProductionConfig } from './config.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { paymentRoutes } from './routes/payments.js';
import { contentRoutes } from './routes/content.js';
import { nftRoutes } from './routes/nft.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { adminRoutes } from './routes/admin.js';
import { loadContent } from './services/contentService.js';

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  // CORS for Telegram Mini App
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting (generous for dev/preview; per-IP)
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
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
  await app.register(nftRoutes, { prefix: '/api/nft' });
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
