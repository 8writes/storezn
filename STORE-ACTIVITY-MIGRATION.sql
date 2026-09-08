-- Store-level audit trail: important staff (and owner) actions, visible
-- to the store owner. Plus per-sale cashier attribution on orders.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f STORE-ACTIVITY-MIGRATION.sql

ALTER TABLE orders ADD COLUMN IF NOT EXISTS sold_by_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sold_by_name text;

CREATE TABLE IF NOT EXISTS store_activity_logs (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id),
  -- Plain reference, not FK: an actor is a vendor (users.id) or a staff
  -- member (staff.id) - two tables since the auth split. Null-able so a
  -- removed staff member's history survives; actor_name is denormalised.
  actor_id    text,
  actor_name  text NOT NULL,
  actor_role  text NOT NULL,          -- 'vendor' | 'staff'
  branch_id   text,
  action      text NOT NULL,          -- e.g. 'pos.sale', 'pos.return', 'register.close', 'stock.adjust'
  summary     text NOT NULL,          -- one-line human-readable
  target_type text,
  target_id   text,
  metadata    jsonb,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_activity_store_created
  ON store_activity_logs (store_id, created_at DESC);
