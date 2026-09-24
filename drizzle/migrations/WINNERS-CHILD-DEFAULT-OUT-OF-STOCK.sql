-- One-time, idempotent production correction.
-- Gives every product and variant an explicit stock value of zero at the
-- Winners Child Supermarket default branch.
BEGIN;

DO $$
DECLARE
  target_store_id text;
  default_branch_id text;
BEGIN
  SELECT id INTO STRICT target_store_id
  FROM stores
  WHERE lower(trim(name)) = lower('Winners Child Supermarket');

  SELECT id INTO STRICT default_branch_id
  FROM branches
  WHERE store_id = target_store_id AND is_default = true;

  INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
  SELECT
    md5('winners-default-base:' || p.id || ':' || default_branch_id),
    p.id,
    null,
    default_branch_id,
    0
  FROM products p
  WHERE p.store_id = target_store_id
  ON CONFLICT (product_id, branch_id) WHERE variant_id IS NULL
  DO UPDATE SET stock = 0;

  INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
  SELECT
    md5('winners-default-variant:' || pv.id || ':' || default_branch_id),
    pv.product_id,
    pv.id,
    default_branch_id,
    0
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE p.store_id = target_store_id
  ON CONFLICT (product_id, variant_id, branch_id) WHERE variant_id IS NOT NULL
  DO UPDATE SET stock = 0;

  UPDATE products p
  SET stock = totals.stock
  FROM (
    SELECT pbs.product_id,
      CASE WHEN bool_or(pbs.stock IS NULL) THEN NULL ELSE sum(pbs.stock)::integer END AS stock
    FROM product_branch_stock pbs
    WHERE pbs.variant_id IS NULL
    GROUP BY pbs.product_id
  ) totals
  WHERE p.id = totals.product_id AND p.store_id = target_store_id;

  UPDATE product_variants pv
  SET stock = totals.stock
  FROM (
    SELECT pbs.variant_id,
      CASE WHEN bool_or(pbs.stock IS NULL) THEN NULL ELSE sum(pbs.stock)::integer END AS stock
    FROM product_branch_stock pbs
    WHERE pbs.variant_id IS NOT NULL
    GROUP BY pbs.variant_id
  ) totals
  WHERE pv.id = totals.variant_id
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = pv.product_id AND p.store_id = target_store_id
    );
END $$;

COMMIT;
