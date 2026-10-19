-- Manual dollar rate.
--
-- The platform owner can type the USD rate (naira per $1) in super-admin.
-- It is stored in exchange_rates as provider 'manual' - no new column - and
-- never goes stale (lib/fxRates.js). New stores now default to it instead
-- of Wise, which needs an API token that isn't configured.
--
-- Default only: existing stores keep whatever they have, and a store still
-- set to 'wise' already falls back to the manual rate automatically.
-- Display only - nothing is ever charged at these rates.
--
-- Idempotent.

ALTER TABLE "stores" ALTER COLUMN "usd_rate_provider" SET DEFAULT 'manual';
