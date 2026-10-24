/**
 * Разовый переезд: DATA_DIR/*.json + entitlements.json → PostgreSQL.
 *
 *   STORAGE=postgres DATABASE_URL=... npm run storage:import -w packages/server
 *
 * Идемпотентен (upsert по ключам): можно гонять повторно. Использует тот же
 * Prisma-бэкенд, что и сервер, + SQL-миграции структуры.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { config } from '../config.js';
import { createPgBackend } from '../services/pgStore.js';
import { isStateFile } from '../services/jsonStore.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('storage:import requires DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const executor = {
  query: async (sql: string, args: unknown[]) => {
    const res = await pool.query(sql, args as unknown[]);
    return {
      rows: res.rows as Array<Record<string, unknown>>,
      fields: res.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rowCount: res.rowCount,
    };
  },
};

const backend = createPgBackend(executor, console.log);
await backend.migrate();

let players = 0;
for (const file of readdirSync(config.dataDir).filter(isStateFile)) {
  const userId = file.replace(/\.json$/, '');
  const raw = JSON.parse(readFileSync(join(config.dataDir, file), 'utf-8'));
  await backend.players.put(userId, raw);
  players += 1;
}
console.log(`players imported: ${players}`);

let purchases = 0;
const regFile = join(config.dataDir, 'entitlements.json');
if (existsSync(regFile)) {
  const reg = JSON.parse(readFileSync(regFile, 'utf-8'));
  for (const rec of Object.values(reg.charges ?? {}) as Array<Record<string, unknown>>) {
    await backend.purchases.put({
      chargeId: String(rec.chargeId),
      userId: String(rec.userId),
      productId: String(rec.productId),
      stars: Number(rec.stars),
      at: Number(rec.at),
      ...(rec.mock ? { mock: true } : {}),
      ...(rec.refundedAt ? { refundedAt: Number(rec.refundedAt) } : {}),
    });
    purchases += 1;
  }
}
console.log(`purchases imported: ${purchases}`);

await backend.close();
await pool.end();
console.log('storage:import done');
