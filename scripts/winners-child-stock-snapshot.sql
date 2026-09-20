\pset pager off

SELECT
  s.id AS store_id,
  s.name AS store_name,
  b.id AS branch_id,
  b.name AS branch_name,
  b.is_default,
  count(pbs.id) AS stock_rows,
  coalesce(sum(pbs.stock) FILTER (WHERE pbs.variant_id IS NULL), 0) AS base_stock,
  coalesce(sum(pbs.stock) FILTER (WHERE pbs.variant_id IS NOT NULL), 0) AS variant_stock,
  count(*) FILTER (WHERE pbs.stock IS NULL AND pbs.id IS NOT NULL) AS unlimited_rows
FROM stores s
JOIN branches b ON b.store_id = s.id
LEFT JOIN product_branch_stock pbs ON pbs.branch_id = b.id
WHERE lower(trim(s.name)) = lower('Winners Child Supermarket')
GROUP BY s.id, s.name, b.id, b.name, b.is_default
ORDER BY b.is_default DESC, b.name;

SELECT
  p.name AS product_name,
  pv.options AS variant_options,
  pbs.stock
FROM product_branch_stock pbs
JOIN branches b ON b.id = pbs.branch_id
JOIN stores s ON s.id = b.store_id
JOIN products p ON p.id = pbs.product_id
LEFT JOIN product_variants pv ON pv.id = pbs.variant_id
WHERE lower(trim(s.name)) = lower('Winners Child Supermarket')
  AND b.is_default = true
  AND coalesce(pbs.stock, 0) <> 0
ORDER BY p.name;

SELECT
  st.id,
  st.first_name,
  st.last_name,
  st.branch_id,
  b.name AS branch_name
FROM staff st
JOIN stores s ON s.id = st.store_id
LEFT JOIN branches b ON b.id = st.branch_id
WHERE lower(trim(s.name)) = lower('Winners Child Supermarket')
ORDER BY st.created_at;
