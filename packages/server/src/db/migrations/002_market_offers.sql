-- P2P-витрина площадки (эскроу-лайт): объявления игроков о продаже питомцев.
-- Структура: активное объявление держит питомца «в эскроу» (у продавца он
-- вычтен из сейва), деньги покупателя сидят в записи до выплаты (paid_out).
-- Источник правды по структуре; prisma/schema.prisma — документация.

CREATE TABLE IF NOT EXISTS market_offers (
  id         text PRIMARY KEY,
  seller_id  text NOT NULL,
  item_id    text NOT NULL,
  price      integer NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  status     text NOT NULL,
  buyer_id   text,
  sold_at    bigint
);

CREATE INDEX IF NOT EXISTS market_offers_status_idx ON market_offers (status);
CREATE INDEX IF NOT EXISTS market_offers_seller_idx ON market_offers (seller_id);
