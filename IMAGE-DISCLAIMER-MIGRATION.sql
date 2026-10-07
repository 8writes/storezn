-- products.image_disclaimer
--
-- Per-product toggle: when true, the storefront overlays an "Image for
-- illustration purposes only" badge on this product's photos (grid,
-- featured rail, detail gallery). See lib/db/schema.js.
--
-- Run this against production BEFORE deploying the matching code: drizzle
-- names every column in its select(), so deploying first makes every
-- query against `products` fail. Idempotent - safe to re-run.
alter table "products"
  add column if not exists "image_disclaimer" boolean not null default false;
