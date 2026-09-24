-- Per-store Storezn+ price: a dedicated Paystack Plan per overridden store.
-- Paystack renews a subscription at its plan's amount, so the shared plan
-- made subscriptionPriceOverride a no-op on renewals. This column holds
-- the per-store plan code. Additive, nullable.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f PLAN-OVERRIDE-MIGRATION.sql

ALTER TABLE stores ADD COLUMN IF NOT EXISTS paystack_plan_code_override text;
