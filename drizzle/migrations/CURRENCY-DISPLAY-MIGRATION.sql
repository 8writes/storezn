-- Storefront dollar display.
--
-- Display only: products are priced in naira and Paystack charges naira,
-- exactly as before. A vendor can let customers view prices converted to
-- USD at a fetched exchange rate, and see the dollar equivalent while
-- typing a price.
--
-- exchange_rates holds the LATEST rate per provider (upserted hourly by
-- /api/cron/fx-rates) - no history, nothing is ever charged at these
-- figures. ngn_per_unit = how many naira one dollar buys.
--
-- Both store columns default to "off / wise", so no existing storefront
-- changes until its vendor switches the feature on.
--
-- Idempotent. Run against production BEFORE deploying the matching code -
-- drizzle names every column in its select(), so deploying first breaks
-- every query against stores.

CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "provider"     text NOT NULL,
  "currency"     text NOT NULL,
  "ngn_per_unit" real NOT NULL,
  "fetched_at"   timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("provider", "currency")
);

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "usd_display_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "usd_rate_provider" text NOT NULL DEFAULT 'wise';
