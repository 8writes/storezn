-- Product names are unique per store after case and whitespace are ignored.
-- Preserve existing rows: older collisions are renamed for vendor review
-- rather than deleted or merged, which could corrupt stock/order history.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY store_id, lower(regexp_replace(trim(name), '[[:space:]]+', '', 'g'))
      ORDER BY created_at, id
    ) AS duplicate_number
  FROM products
)
UPDATE products AS product
SET
  name = product.name || ' (duplicate ' || product.id || ')',
  updated_at = now()
FROM ranked
WHERE product.id = ranked.id
  AND ranked.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_store_name_normalized
  ON products (store_id, lower(regexp_replace(trim(name), '[[:space:]]+', '', 'g')));
