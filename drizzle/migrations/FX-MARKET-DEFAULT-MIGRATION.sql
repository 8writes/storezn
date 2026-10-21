-- The manual "Storezn rate" is retired; the free market rate
-- (ExchangeRate-API, refreshed hourly by /api/cron/fx-rates) is the default.
-- Idempotent. Code already treats "manual" as "market", so this is tidy-up.
ALTER TABLE "stores" ALTER COLUMN "usd_rate_provider" SET DEFAULT 'market';
UPDATE "stores" SET "usd_rate_provider" = 'market' WHERE "usd_rate_provider" = 'manual';
DELETE FROM "exchange_rates" WHERE "provider" = 'manual';
