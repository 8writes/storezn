-- Per-user "last active" heartbeat, written (throttled to once / 2 min)
-- by getUser in lib/auth.js. Admin-only surface: super-admin vendors +
-- team pages.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f LAST-ACTIVE-MIGRATION.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamp;
