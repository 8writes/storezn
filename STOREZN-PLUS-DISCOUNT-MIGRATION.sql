-- Per-store first-month percentage discount for Storezn+ subscriptions.
-- The resulting monthly amount remains in subscription_price_override so
-- Paystack's dedicated per-store plan and the displayed price stay aligned.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f STOREZN-PLUS-DISCOUNT-MIGRATION.sql

ALTER TABLE stores ADD COLUMN IF NOT EXISTS subscription_discount_percent real;

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_subscription_discount_percent_check;
ALTER TABLE stores ADD CONSTRAINT stores_subscription_discount_percent_check
  CHECK (subscription_discount_percent IS NULL OR (subscription_discount_percent >= 1 AND subscription_discount_percent <= 99));
