-- store_visits and wishlist_items.
--
-- store_visits: one row per visitor per store per day, so unique visitors
-- is count(distinct visitor_id) over any range and a shopper who browses
-- all afternoon counts once. visitor_id is a random value generated and
-- kept by the shopper's own browser - it identifies a browser, not a
-- person - and is only ever written for shoppers who accepted analytics
-- cookies. Anyone who declines is simply not counted.
--
-- wishlist_items: a logged-in customer's saved products. Customers are
-- store-scoped so a wishlist never spans stores; store_id is carried
-- anyway so a vendor can ask "what is being saved but not bought" without
-- joining through products.
--
-- Run against production BEFORE deploying the matching code. Idempotent.

CREATE TABLE IF NOT EXISTS "store_visits" (
  "id"         text PRIMARY KEY,
  "store_id"   text NOT NULL REFERENCES "stores"("id"),
  "visitor_id" text NOT NULL,
  "visit_day"  date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_store_visits_store_day"
  ON "store_visits" ("store_id", "visit_day");

-- The dedup itself: a repeat visit on the same day is a no-op insert.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_store_visits_store_visitor_day"
  ON "store_visits" ("store_id", "visitor_id", "visit_day");

CREATE TABLE IF NOT EXISTS "wishlist_items" (
  "id"          text PRIMARY KEY,
  "store_id"    text NOT NULL REFERENCES "stores"("id"),
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "product_id"  text NOT NULL REFERENCES "products"("id"),
  "created_at"  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_wishlist_customer"
  ON "wishlist_items" ("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_wishlist_product"
  ON "wishlist_items" ("product_id");

-- Tapping the heart twice saves one item, not two.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wishlist_customer_product"
  ON "wishlist_items" ("customer_id", "product_id");
