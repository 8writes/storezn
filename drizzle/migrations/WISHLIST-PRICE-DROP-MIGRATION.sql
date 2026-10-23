-- Wishlist "price drop" emails (lib/wishlistAlerts.js): the price each
-- shopper was last emailed about, so one sale isn't sent twice. Idempotent.
ALTER TABLE "wishlist_items" ADD COLUMN IF NOT EXISTS "sale_notified_price" real;
ALTER TABLE "wishlist_items" ADD COLUMN IF NOT EXISTS "sale_notified_at" timestamp;
