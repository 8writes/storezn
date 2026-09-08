-- Cashier drawer actions (paid_in / paid_out / drop) had no idempotency
-- key, so a flaky network + an un-disabled "Record" button let one
-- intended payout be written many times (a real incident: one -N900
-- "noodles" payout recorded 27x in 28 seconds).
--
-- client_ref is a UUID the client generates once per button press and
-- reuses on every retry; the partial unique index makes a repeat insert
-- a no-op the server turns into "return the row that already exists".
-- Safe + additive on live data; existing rows keep client_ref NULL.
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS client_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_movements_client_ref
  ON cash_movements (session_id, client_ref)
  WHERE client_ref IS NOT NULL;
