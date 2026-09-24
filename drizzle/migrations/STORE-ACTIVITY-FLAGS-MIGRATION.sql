ALTER TABLE store_activity_logs
  ADD COLUMN IF NOT EXISTS flagged_at timestamp,
  ADD COLUMN IF NOT EXISTS flag_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp;

CREATE INDEX IF NOT EXISTS idx_store_activity_flagged
  ON store_activity_logs (store_id, flagged_at, reviewed_at);
