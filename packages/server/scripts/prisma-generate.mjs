#!/usr/bin/env node
/**
 * Обёртка над `prisma generate`, работающая и офлайн.
 *
 * Клиент собирается engine-less (`engineType = "client"`), поэтому Rust-движки
 * для генерации не нужны; но CLI перед генерацией всё равно пытается скачать
 * schema-engine с binaries.prisma.sh. Переопределение путей к движкам (только
 * для этой команды) гасит эту попытку — генерация проходит в любой сети.
 * Сгенерированный клиент коммитится (src/generated/prisma) — сборкам и CI
 * генерация не нужна вовсе.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');

const r = spawnSync('npx', ['prisma', 'generate'], {
  cwd: serverRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY || '/bin/true',
    PRISMA_QUERY_ENGINE_LIBRARY: process.env.PRISMA_QUERY_ENGINE_LIBRARY || '/bin/true',
    PRISMA_QUERY_ENGINE_BINARY: process.env.PRISMA_QUERY_ENGINE_BINARY || '/bin/true',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/itsim',
  },
});
process.exit(r.status ?? 1);
