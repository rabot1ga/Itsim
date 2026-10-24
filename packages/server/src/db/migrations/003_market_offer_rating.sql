-- P2P-итерация 2: оценка продавца покупателем (1–5 звёзд, одна на сделку).
-- ALTER поверх 001/002; файл применяется один раз (schema_migrations).
-- prisma/schema.prisma — документация.

ALTER TABLE market_offers ADD COLUMN buyer_rating integer;
