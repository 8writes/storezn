-- One-time, idempotent production data correction.
-- Moves all default-branch stock for Winners Child Supermarket into
-- Winners Child Supermarket - Eliozu, preserving any stock already there.
BEGIN;

DO $$
DECLARE
  target_store_id text;
  source_branch_id text;
  destination_branch_id text;
BEGIN
  SELECT id INTO STRICT target_store_id
  FROM stores
  WHERE lower(trim(name)) = lower('Winners Child Supermarket');

  SELECT id INTO STRICT source_branch_id
  FROM branches
  WHERE store_id = target_store_id AND is_default = true;

  SELECT id INTO STRICT destination_branch_id
  FROM branches
  WHERE store_id = target_store_id
    AND lower(trim(name)) = lower('Winners Child Supermarket - Eliozu');

  IF source_branch_id = destination_branch_id THEN
    RAISE EXCEPTION 'Source and destination branches must be different';
  END IF;

  -- Base-product rows use the partial unique index where variant_id is null.
  INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
  SELECT md5('winners-eliozu-base:' || id || ':' || destination_branch_id), product_id, null, destination_branch_id, stock
  FROM product_branch_stock
  WHERE branch_id = source_branch_id AND variant_id IS NULL
  ON CONFLICT (product_id, branch_id) WHERE variant_id IS NULL
  DO UPDATE SET stock = CASE
    WHEN product_branch_stock.stock IS NULL OR EXCLUDED.stock IS NULL THEN NULL
    ELSE product_branch_stock.stock + EXCLUDED.stock
  END;

  -- Variant rows use the full product/variant/branch unique index.
  INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
  SELECT md5('winners-eliozu-variant:' || id || ':' || destination_branch_id), product_id, variant_id, destination_branch_id, stock
  FROM product_branch_stock
  WHERE branch_id = source_branch_id AND variant_id IS NOT NULL
  ON CONFLICT (product_id, variant_id, branch_id) WHERE variant_id IS NOT NULL
  DO UPDATE SET stock = CASE
    WHEN product_branch_stock.stock IS NULL OR EXCLUDED.stock IS NULL THEN NULL
    ELSE product_branch_stock.stock + EXCLUDED.stock
  END;

  UPDATE product_branch_stock
  SET stock = 0
  WHERE branch_id = source_branch_id;

  -- Rebuild the cached aggregate values after the branch transfer.
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
