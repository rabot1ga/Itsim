/**
 * Раннер SQL-миграций (`src/db/migrations/*.sql`).
 *
 * `prisma migrate` тянет schema-engine с binaries.prisma.sh и не работает
 * офлайн; структуру держат SQL-файлы в репозитории, применяются они вот этим
 * раннером при старте сервера (STORAGE=postgres) и из скрипта импорта.
 * Применение идемпотентно: каждая миграция фиксируется в `schema_migrations`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlExecutor } from './adapter.js';

// Путь вне module-dir: tsc не копирует .sql в dist, а раннер живёт и в src/
// (tsx), и в dist/ — от корня пакета до src/db/migrations одинаково близко.
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'db', 'migrations');

export async function runMigrations(executor: SqlExecutor, log: (msg: string) => void = () => {}): Promise<void> {
  await executor.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  );

  const applied = new Set((await executor.query('SELECT id FROM schema_migrations', [])).rows.map((r) => String(r.id)));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    // Каждый файл — одна транзакция: частично применённой миграции не бывает.
    await executor.query('BEGIN', []);
    try {
      for (const statement of sql
        .split(/;\s*(?:\n|$)/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        await executor.query(statement, []);
      }
      await executor.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await executor.query('COMMIT', []);
      log(`↻ applied migration ${file}`);
    } catch (err) {
      await executor.query('ROLLBACK', []);
      throw err;
    }
  }
}
