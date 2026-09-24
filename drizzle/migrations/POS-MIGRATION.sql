-- POS (Storezn Register) - P1 schema.
-- Additive only: new enum types, one new enum value, new nullable columns
-- on orders/order_items, five new tables, partial unique indexes.
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f POS-MIGRATION.sql
-- The deploy does NOT run drizzle-kit push - this is applied by hand,
-- same as AUDIT-MIGRATION.sql.

BEGIN;

-- ---------- enums ----------
DO $$ BEGIN
  CREATE TYPE order_channel AS ENUM ('online', 'pos', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pos_session_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cash_movement_kind AS ENUM ('float', 'cash_sale', 'cash_refund', 'paid_in', 'paid_out', 'drop');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tender_method AS ENUM ('cash', 'card', 'transfer', 'wallet', 'store_credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- orders columns ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel order_channel NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_order_id text;

-- Backfill: every existing "record an offline order" row is a manual
-- entry, not a live-till sale. Everything else is a storefront order.
UPDATE orders SET channel = 'manual' WHERE is_offline = true AND channel = 'online';

-- ---------- order_items columns ----------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_unit_price real;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_discount integer NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_overridden boolean NOT NULL DEFAULT false;

-- ---------- pos_registers ----------
CREATE TABLE IF NOT EXISTS pos_registers (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id),
  branch_id   text NOT NULL REFERENCES branches(id),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_registers_store_id ON pos_registers (store_id);
CREATE INDEX IF NOT EXISTS idx_pos_registers_branch_id ON pos_registers (branch_id);

-- ---------- pos_sessions ----------
CREATE TABLE IF NOT EXISTS pos_sessions (
  id            text PRIMARY KEY,
  register_id   text NOT NULL REFERENCES pos_registers(id),
  status        pos_session_status NOT NULL DEFAULT 'open',
  opened_by     text NOT NULL,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  opening_float integer NOT NULL DEFAULT 0,
  closed_by     text,
  closed_at     timestamptz,
  counted_cash  integer,
  expected_cash integer,
  over_short    integer,
  z_report      jsonb
);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_register_id ON pos_sessions (register_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_sessions_open_register
  ON pos_sessions (register_id) WHERE status = 'open';

-- ---------- cash_movements ----------
CREATE TABLE IF NOT EXISTS cash_movements (
  id          text PRIMARY KEY,
  session_id  text NOT NULL REFERENCES pos_sessions(id),
  kind        cash_movement_kind NOT NULL,
  amount      integer NOT NULL,
  reason      text,
  order_id    text REFERENCES orders(id),
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements (session_id);

-- ---------- order_tenders ----------
CREATE TABLE IF NOT EXISTS order_tenders (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id),
  method       tender_method NOT NULL,
  amount       integer NOT NULL,
  change_given integer NOT NULL DEFAULT 0,
  reference    text,
  session_id   text REFERENCES pos_sessions(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_tenders_order_id ON order_tenders (order_id);
CREATE INDEX IF NOT EXISTS idx_order_tenders_session_id ON order_tenders (session_id);

-- ---------- pos_held_sales ----------
CREATE TABLE IF NOT EXISTS pos_held_sales (
  id          text PRIMARY KEY,
  session_id  text NOT NULL REFERENCES pos_sessions(id),
  label       text,
  cart        jsonb NOT NULL,
  customer    jsonb,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_held_sales_session_id ON pos_held_sales (session_id);

COMMIT;
