-- safe_movements: a record-only ledger for a branch's safe.
--
-- Until now a drawer `drop` moved cash out of a till and the money left
-- the system entirely, while a `paid_in` arrived from nowhere - so
-- nothing could answer "how much is in the safe?". This is the other half
-- of both moves, plus expenses paid straight out of the safe (the daily
-- contribution, a supplier, a bank deposit).
--
-- Same discipline as cash_movements: signed kobo, + into the safe, and
-- the balance is always SUM(amount). There is no cached balance column,
-- so a correction is a new row and the figure cannot drift.
--
-- DO NOT BACKFILL historical `drop` rows into this table. That money
-- genuinely left the system when it was dropped; inventing drop_in rows
-- for it would show a large fictitious balance from day one. Every branch
-- starts at zero and the owner records a single `opening` row for what is
-- physically in the safe today.
--
-- Run against production BEFORE deploying the matching code. Idempotent.

DO $$ BEGIN
  CREATE TYPE safe_movement_kind AS ENUM ('opening','drop_in','topup_out','expense_out','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "safe_movements" (
  "id"               text PRIMARY KEY,
  "store_id"         text NOT NULL REFERENCES "stores"("id"),
  "branch_id"        text NOT NULL REFERENCES "branches"("id"),
  "kind"             safe_movement_kind NOT NULL,
  "amount"           integer NOT NULL,
  "reason"           text,
  "session_id"       text REFERENCES "pos_sessions"("id"),
  "cash_movement_id" text REFERENCES "cash_movements"("id"),
  "created_by"       text NOT NULL,
  "client_ref"       text,
  "created_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_safe_movements_branch"
  ON "safe_movements" ("branch_id", "created_at");

-- One value per button press, so a flaky network can't record the same
-- safe movement twice (mirrors uq_cash_movements_client_ref).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_safe_movements_client_ref"
  ON "safe_movements" ("branch_id", "client_ref") WHERE "client_ref" IS NOT NULL;

-- One safe leg per drawer movement: a retried drop can never be credited
-- to the safe twice.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_safe_movements_cash_leg"
  ON "safe_movements" ("cash_movement_id") WHERE "cash_movement_id" IS NOT NULL;

-- "What's in the safe today" is stated exactly once per branch.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_safe_movements_opening"
  ON "safe_movements" ("branch_id") WHERE "kind" = 'opening';
