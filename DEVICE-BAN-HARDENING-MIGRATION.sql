-- Hardening for the device-ban system (review follow-up).
-- 1. banned_devices.customer_id: so lifting a device ban un-bans exactly
--    the one customer it was tied to, not every customers row that
--    happens to share the same email string (across all stores).
-- 2. customers.banned_by / banned_at: an auditable "who + when" for a
--    customer ban, to back the appeal process.

ALTER TABLE banned_devices ADD COLUMN IF NOT EXISTS customer_id text;
CREATE INDEX IF NOT EXISTS idx_banned_devices_customer_id ON banned_devices (customer_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_by text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_at timestamp;
