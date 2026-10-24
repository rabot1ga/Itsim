-- P2.6 init: игроки (JSONB-сейв) + реестр покупок Stars.
-- Источник правды по структуре; prisma/schema.prisma — документация + типы.

CREATE TABLE IF NOT EXISTS players (
  user_id    text PRIMARY KEY,
  state      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  charge_id   text PRIMARY KEY,
  user_id     text NOT NULL,
  product_id  text NOT NULL,
  stars       integer NOT NULL,
  at          timestamptz NOT NULL,
  mock        boolean NOT NULL DEFAULT false,
  refunded_at timestamptz
);

CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases (user_id);
