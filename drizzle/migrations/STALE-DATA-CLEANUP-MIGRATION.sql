-- Indexes used by the external stale-data cleanup job.
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_used_at ON tokens (used_at);
