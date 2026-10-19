-- International payments.
--
-- A store can accept international payments. Its storefront then opens
-- in dollars (display only - Paystack still charges naira), and checkout
-- asks the customer whether they are paying with a card from outside
-- Nigeria. If they are, the order uses the platform's INTERNATIONAL fee
-- settings below instead of the local ones, because Paystack charges
-- international cards more (3.9% + N100 at the time of writing).
--
-- Idempotent. Run against production BEFORE deploying the matching code.

-- 1. The store switch. It was added days ago as "usd_display_enabled"
--    (CURRENCY-DISPLAY-MIGRATION.sql) for the dollar display alone; it now
--    means "accepts international payments". No deployed code reads the old
--    name, so it is renamed rather than duplicated. Guarded so a re-run
--    after the rename is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'usd_display_enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'international_payments_enabled'
  ) THEN
    ALTER TABLE "stores" RENAME COLUMN "usd_display_enabled" TO "international_payments_enabled";
  END IF;
END $$;

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "international_payments_enabled" boolean NOT NULL DEFAULT false;

-- 2. Platform-wide international fee settings - the counterparts of
--    default_commission_rate_percent / max_commission_amount /
--    default_flat_fee, used only for orders the customer marked as paid
--    with a foreign card. A store's own custom (local) commission rate
--    never applies to these. NULL cap = no cap, same as the local one.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "intl_commission_rate_percent" real NOT NULL DEFAULT 3.9;
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "intl_max_commission_amount" real;
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "intl_flat_fee" real NOT NULL DEFAULT 100;

-- 3. Which fee mode an order was priced under, snapshotted like the other
--    fee columns so a later settings change never rewrites history.
ALTER TABLE "checkout_attempts"
  ADD COLUMN IF NOT EXISTS "international" boolean NOT NULL DEFAULT false;
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "international" boolean NOT NULL DEFAULT false;

-- 4. The country that issued the card that actually paid, from Paystack's
--    verification (authorization.country_code). Lets an owner spot an order
--    priced as local but paid with a foreign card. NULL for non-card
--    payments and for every order before this existed.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "card_country" text;
