-- Storefront featured/discounted rails + review photos.
-- Safe to re-run.

-- Vendor-curated "Featured" rail (null = not featured, else 0-based rail position).
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_order integer;

-- Partial index: the storefront rail query only ever looks at featured rows.
CREATE INDEX IF NOT EXISTS idx_products_featured
  ON products (store_id, featured_order)
  WHERE featured_order IS NOT NULL;

-- One optional customer photo per review.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_url text;
