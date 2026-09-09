-- Device ban + signup abuse tracking (anti spam-account farming).
-- Additive + safe on live data.

ALTER TABLE users     ADD COLUMN IF NOT EXISTS signup_device_id text;
ALTER TABLE users     ADD COLUMN IF NOT EXISTS signup_ip        text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_reason    text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS signup_device_id text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS signup_ip        text;
CREATE INDEX IF NOT EXISTS idx_customers_signup_device ON customers (signup_device_id);

CREATE TABLE IF NOT EXISTS banned_devices (
  id            text PRIMARY KEY,
  device_id     text,
  fingerprint   text,
  reason        text,
  auto_flagged  boolean NOT NULL DEFAULT false,
  subject_email text,
  banned_by     text,
  banned_at     timestamp NOT NULL DEFAULT now(),
  unbanned_at   timestamp,
  unbanned_by   text
);
CREATE INDEX IF NOT EXISTS idx_banned_devices_device_id   ON banned_devices (device_id);
CREATE INDEX IF NOT EXISTS idx_banned_devices_fingerprint ON banned_devices (fingerprint);

CREATE TABLE IF NOT EXISTS signup_abuse_events (
  id               text PRIMARY KEY,
  device_id        text,
  fingerprint      text,
  ip               text,
  normalized_email text,
  kind             text NOT NULL,
  created_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signup_abuse_device_created ON signup_abuse_events (device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_signup_abuse_created        ON signup_abuse_events (created_at);
