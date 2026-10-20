-- International delivery.
--
-- Until now delivery was Nigeria-only: rates keyed on (state, city) and an
-- address's country always "Nigeria". This adds the country level, the
-- same idea as Shopify's shipping zones but kept to our existing shape -
-- a rate can be set for a whole country, a state/region in it, or a city
-- /LGA in that, and the most specific match wins (lib/shipping.js).
--
-- Nigeria is unchanged: existing behaviour, the state/LGA dropdowns, the
-- "only these states" restriction and the local default fee. Delivery
-- abroad has its own on/off switch, the vendor's list of countries, and its
-- own default fee - independent of "Accept international payments".
--
-- At the time of writing shipping_rates is EMPTY in production, so the
-- index rebuild below loses nothing. Idempotent. Run BEFORE deploying.

-- 1. Rates gain a country; a country-wide rate has no state.
ALTER TABLE "shipping_rates"
  ADD COLUMN IF NOT EXISTS "country" text NOT NULL DEFAULT 'Nigeria';
ALTER TABLE "shipping_rates"
  ALTER COLUMN "state" DROP NOT NULL;

-- One rate per (country, state, city) per store, case-insensitively - the
-- old two indexes were keyed on state alone and can't express a
-- country-level rate.
DROP INDEX IF EXISTS "uq_shipping_rates_store_state";
DROP INDEX IF EXISTS "uq_shipping_rates_store_state_city";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_shipping_rates_store_place"
  ON "shipping_rates" (
    "store_id",
    lower("country"),
    coalesce(lower("state"), ''),
    coalesce(lower("city"), '')
  );

-- 2. Store settings for delivery abroad.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "international_delivery_enabled" boolean NOT NULL DEFAULT false;
-- Countries (by name, excluding Nigeria) the store delivers to. NULL with
-- international delivery on = anywhere in the world.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "delivery_countries" jsonb;
-- Fallback for an allowed country with no rate of its own.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "intl_default_shipping_fee" real NOT NULL DEFAULT 0;
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "intl_default_shipping_is_tbd" boolean NOT NULL DEFAULT true;

-- 3. Addresses abroad need a postcode.
ALTER TABLE "addresses"
  ADD COLUMN IF NOT EXISTS "postal_code" text;
