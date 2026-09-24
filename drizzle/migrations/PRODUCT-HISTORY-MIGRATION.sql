CREATE INDEX IF NOT EXISTS idx_store_activity_target_created
  ON store_activity_logs (store_id, target_type, target_id, created_at);
