-- Cost price (internal margin tracking, never exposed on the storefront)
-- and quantity price breaks / wholesale tiers.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f PRICING-MIGRATION.sql

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price real;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers jsonb;
