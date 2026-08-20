import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { paymentRoutes } from './routes/payments.js';
import { contentRoutes } from './routes/content.js';
import { nftRoutes } from './routes/nft.js';
import { loadContent } from './services/contentService.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

async function start() {
  // Load and validate content at startup
  try {
    loadContent();
    console.log('✓ All content validated successfully');
  } catch (err) {
    console.error('✗ Content validation failed:', err);
    process.exit(1);
  }

  const app = Fastify({ logger: true });

  // CORS for Telegram Mini App
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '2.0.0' }));

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(gameRoutes, { prefix: '/api/game' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(nftRoutes, { prefix: '/api/nft' });

  // Start
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`✓ Server running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();