import { FastifyInstance } from 'fastify';
import { appendFileSync, mkdirSync, readFileSync, statSync, existsSync, openSync, closeSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { telegramAuthHook } from '../middleware/telegramAuth.js';

/**
 * Product telemetry (roadmap P0.3).
 *
 * The client fires lightweight events (day_end, action, buy, screen_view,
 * check_in, …). They are appended to `data/telemetry.ndjson` — one JSON object
 * per line, newline-delimited — which keeps the prototype honest without a
 * database. Each event carries a timestamp (server clock) and the telegram id
 * so funnels can be rebuilt later; the storage layer is thin enough to swap
 * for Postgres once the product needs real analytics.
 *
 * Endpoint contract:
 *   POST /api/telemetry  body { event, payload? }  → 204, never blocks the game
 *   GET  /api/telemetry/summary?hours=24  → last-N-hours counts per event
 */

interface TelemetryEvent {
  t: number;
  uid: string;
  event: string;
  payload?: Record<string, unknown>;
}

const FILE = () => join(config.dataDir, 'telemetry.ndjson');

function ensureFile(): void {
  mkdirSync(config.dataDir, { recursive: true });
  const file = FILE();
  if (!existsSync(file)) {
    // touch it so appendFileSync never fails on a missing dir/file
    closeSync(openSync(file, 'a'));
  }
}

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', telegramAuthHook);

  app.post('/', async (request, reply) => {
    const user = (request as any).telegramUser;
    const { event, payload } = (request.body ?? {}) as { event?: string; payload?: Record<string, unknown> };
    if (!event || typeof event !== 'string' || event.length > 80) {
      return reply.status(400).send({ error: 'event is required (string, ≤80 chars)' });
    }
    const line: TelemetryEvent = { t: Date.now(), uid: String(user?.id ?? 'anon'), event, payload };
    try {
      ensureFile();
      appendFileSync(FILE(), `${JSON.stringify(line)}\n`, 'utf8');
    } catch (err) {
      // telemetry must never take the game down
      app.log.warn({ err }, 'telemetry write failed');
    }
    return reply.status(204).send();
  });

  app.get('/summary', async (request) => {
    const q = request.query as { hours?: string };
    const hours = Math.min(168, Math.max(1, Number(q?.hours) || 24));
    const from = Date.now() - hours * 3600 * 1000;
    const counts: Record<string, number> = {};
    try {
      const file = FILE();
      if (!existsSync(file)) return { hours, events: counts, total: 0 };
      if (statSync(file).size > 20 * 1024 * 1024) {
        // keep the summary cheap on big logs: only the tail matters for a dev dashboard
        return { hours, events: counts, total: 0, truncated: true };
      }
      const lines = readFileSync(file, 'utf8').split('\n');
      for (const raw of lines) {
        if (!raw) continue;
        try {
          const e = JSON.parse(raw) as TelemetryEvent;
          if (e.t >= from) counts[e.event] = (counts[e.event] ?? 0) + 1;
        } catch {
          /* skip malformed line */
        }
      }
    } catch (err) {
      app.log.warn({ err }, 'telemetry summary failed');
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { hours, events: counts, total };
  });
}
