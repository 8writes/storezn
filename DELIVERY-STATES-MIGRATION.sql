-- stores.delivery_states
--
-- Which Nigerian states a store delivers to. NULL = everywhere (the
-- behaviour before this column existed, and what every existing store
-- keeps). A JSON array restricts delivery to exactly those states; see
-- canDeliverTo in lib/shipping.js.
--
-- Run against production BEFORE deploying the matching code: drizzle
-- names every column in its select(), so deploying first breaks every
-- query against `stores`. Idempotent - safe to re-run.
alter table "stores"
  add column if not exists "delivery_states" jsonb;
