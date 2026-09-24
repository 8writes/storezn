-- Shared rate-limit counters for multi-worker deployments.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expires_at
  ON rate_limit_buckets (expires_at);
