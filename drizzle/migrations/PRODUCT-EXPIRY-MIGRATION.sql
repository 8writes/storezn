-- Perishable-goods expiry: one "use by" date per product (not per batch -
-- kept deliberately light). The products list shows "expires in N days" /
-- "expired" badges, a filter, and a dashboard count. Internal only -
-- stripInternalProductFields keeps it out of storefront/marketplace reads.
-- Additive + safe on live data.
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date date;
CREATE INDEX IF NOT EXISTS idx_products_expiry_date ON products (store_id, expiry_date)
  WHERE expiry_date IS NOT NULL;
