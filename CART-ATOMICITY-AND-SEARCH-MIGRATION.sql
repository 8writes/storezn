-- Prevent duplicate base-product cart lines and make concurrent add-to-cart
-- requests converge on one row. Merge legacy duplicates before deleting them
-- so quantities are not silently lost if this is run on another database.
WITH ranked AS (
  SELECT id, cart_id, product_id,
         first_value(id) OVER (PARTITION BY cart_id, product_id ORDER BY created_at, id) AS keeper_id,
         row_number() OVER (PARTITION BY cart_id, product_id ORDER BY created_at, id) AS rn
  FROM cart_items
  WHERE variant_id IS NULL
), totals AS (
  SELECT keeper_id, sum(CASE WHEN rn > 1 THEN quantity ELSE 0 END) AS extra_quantity
  FROM ranked
  GROUP BY keeper_id
)
UPDATE cart_items AS item
SET quantity = item.quantity + totals.extra_quantity
FROM totals
WHERE item.id = totals.keeper_id AND totals.extra_quantity > 0;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY cart_id, product_id ORDER BY created_at, id) AS rn
  FROM cart_items
  WHERE variant_id IS NULL
)
DELETE FROM cart_items
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_cart_product_base
  ON cart_items (cart_id, product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_cart_variant
  ON cart_items (cart_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_store_name_trgm
  ON products USING gin (name gin_trgm_ops);
