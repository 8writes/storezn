-- Register-close cash controls. Previously the close screen showed the
-- expected figure next to the count box (invites typing it to "balance"),
-- there was no record of whether a real count happened, and one unsynced
-- order hard-blocked the close - which is how a shift got closed by
-- entering the system's expected amount with no physical count.
--
-- Additive + safe on live data. Shifts closed before this keep NULL
-- close_method and review_status 'ok'.
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS close_method       text,
  ADD COLUMN IF NOT EXISTS count_breakdown    jsonb,
  ADD COLUMN IF NOT EXISTS forced_reason      text,
  ADD COLUMN IF NOT EXISTS provisional        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_sync_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_status      text    NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS reviewed_by        text,
  ADD COLUMN IF NOT EXISTS reviewed_at        timestamp,
  ADD COLUMN IF NOT EXISTS review_note        text;
