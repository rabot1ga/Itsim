# P2.6: PostgreSQL + Prisma вместо JSON-файлов (23.10.2026)

Статус: **реализовано (23.10.2026).** SPEC §12 обещает «PostgreSQL + Prisma
(JSONB для игрового состояния)», в коде до этого шага были JSON-файлы.
Переезд держится на узком интерфейсе хранилища (`load/save/delete/has/scan` +
подписка на записи).

## Аудит (список расхождений)

1. **Хранилище** — `services/gameStore.ts`: JSON-файл на игрока в `DATA_DIR`,
   атомарная запись (tmp+rename), in-memory кэш, миграции сейва при чтении,
   `scanStates()` для leaderboard-индекса, `onStateSaved` для подписчиков.
   Интерфейс узкий, но **синхронный** — Prisma-клиент асинхронный, поэтому
   `loadState/saveState/deleteState/hasState` становятся `async` (вызовы — в
   async-хендлерах Fastify, конверсия механическая; 13 файлов-вызовов).
2. **Покупки (Telegram Stars)** — `services/entitlements.ts`: реестр
   `entitlements.json` по `charge_id` (идемпотентность вебхуков) + гранты в
   сейв. Это платёжный журнал: уезжает в таблицу `purchases`; при GDPR-удалении
   игрока **сохраняется** (retention платёжных документов), удаляется только
   игровой сейв.
3. **Телеметрия** — файловый debug-лог в `DATA_DIR`; **не переезжает** (не
   игровое состояние, ротируется вне базы).
4. **Что не используется и не едет**: `nft_registry.json` из
   `NON_STATE_FILES` — остаток NFT-мока (2b), вычищается.
5. **Инструменты**: `prisma migrate` требует schema-engine с
   binaries.prisma.sh — в офлайн-окружениях (в т.ч. песочница CI-агента)
   недоступен. Схема управляется **SQL-миграциями в репозитории**
   (`src/db/migrations/*.sql` + свой раннер при старте), а `prisma generate`
   проходит офлайн (engine-less клиент, `engineType=«client»` +
   `queryCompiler`/`driverAdapters`). В обычной сети можно пользоваться
   `prisma migrate dev` как обычно — SQL-файлы синхронизируются вручную.

## Дизайн

- **Схема** (`packages/server/prisma/schema.prisma`):
  - `players(user_id text PK, state jsonb, updated_at timestamptz)` — сейв
    как JSONB (миграции сейва остаются на уровне движка, как и было);
  - `purchases(charge_id text PK, user_id, product_id, stars, at, mock,
refunded_at)` — реестр Stars.
  - Сгенерированный клиент (`src/generated/prisma/`) **коммитится**: офлайн-
    сборки и CI не требуют `prisma generate` на месте.
- **Драйвер**: тонкий `SqlDriverAdapter` поверх `pg.Pool` (свой, ~100 строк:
  queryRaw/executeRaw/executeScript/транзакции). Тот же адаптер в тестах
  натравливается на **pg-mem** (in-memory Postgres) — весь SQL-путь
  проверяется без сервера; официальный `@prisma/adapter-pg` не требуется.
- **Бэкенды**: `STORAGE=postgres` + `DATABASE_URL` → Prisma; по умолчанию —
  JSON (dev и обратная совместимость). Facade `services/gameStore.ts` сохраняет
  имена функций и путь импорта — роуты меняются только добавлением `await`.
- **Переезд**: `npm run storage:import -w packages/server` — переносит
  `DATA_DIR/*.json` + `entitlements.json` в базу (идемпотентно, upsert).
- **Тесты**: pg-mem-интеграция (CRUD игроков, миграционный раннер, покупки,
  GDPR-удаление сохраняет purchases), unit JSON-бэкенда; существующие тесты
  переводятся на `await`.

## Проверки

`lint:types`, `eslint`, `validate:content --strict`, юнит-тесты (shared/server/
bot/client), `simulate --check`, `build`, e2e 28/28; pg-путь проверен
pg-mem-интеграцией там же.

## Итог реализации

- **Стек:** `prisma`/`@prisma/client` 6.19.3 + `@prisma/driver-adapter-utils`;
  генератор `prisma-client` c `engineType="client"` (без engine-бинарников;
  `prisma generate` обёрнут в `scripts/prisma-generate.mjs` для офлайн-режима,
  `src/generated/prisma/` коммитится). DDL — SQL-файлы
  `src/db/migrations/001_init.sql` + раннер `runMigrations()`
  (`prisma migrate`/`db push` офлайн недоступны — schema-engine качает
  бинарники).
- **Слои:** `src/db/adapter.ts` (SqlExecutor → Prisma driver-adapter: OID-типы,
  jsonb/даты на границе) → `src/services/pgStore.ts` (PrismaClient с адаптером;
  `players.state` — jsonb, `purchases.at/refundedAt` — timestamptz) →
  async-фасады `gameStore.ts` / `entitlements.ts` (JSON-бэкенды — дефолт;
  `STORAGE=postgres` + `DATABASE_URL` — `initStorage()` поднимает pg.Pool).
- **Данные:** `npm run storage:import` (`src/db/importJson.ts`) — перенос
  `DATA_DIR/*.json` + `entitlements.json` в базу, идемпотентно (upsert).
- **Тесты:** pg-mem (6 интеграционных, `src/__tests__/pgStore.test.ts`) через
  тот же адаптер; исполнитель-шим для pg-mem: `new (db.adapters.createPg().Pool)()`
  (интерполирует `$N`), снятие квалификации `"public".` и `WHERE ... AND 1=1`
  в `ON CONFLICT` — ограничения парсера pg-mem, в проде (настоящий PG) SQL
  Prisma уходит без правок.
- **Совместимость:** JSON-режим не изменился (дефолт); GDPR-удаление стирает
  только `players`, `purchases` остаются (retention); порядок грантов
  `applyGrantsToState` сохранён (arbitrary key order + array concat).
