-- Device registry: one row per device that has signed in / signed up,
-- plus the accounts seen on it, so a super-admin can browse devices with
-- an email attached and ban one straight from the list.

CREATE TABLE IF NOT EXISTS devices (
  device_id       text PRIMARY KEY,
  fingerprint     text,
  first_seen_at   timestamp NOT NULL DEFAULT now(),
  last_seen_at    timestamp NOT NULL DEFAULT now(),
  last_ip         text,
  last_user_agent text,
  seen_count      integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen    ON devices (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint  ON devices (fingerprint);

CREATE TABLE IF NOT EXISTS device_accounts (
  id            text PRIMARY KEY,
  device_id     text NOT NULL,
  account_type  text NOT NULL,          -- 'customer' | 'user' | 'staff'
  account_id    text NOT NULL,
  email         text,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_accounts ON device_accounts (device_id, account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_device_accounts_device ON device_accounts (device_id);
CREATE INDEX IF NOT EXISTS idx_device_accounts_email  ON device_accounts (lower(email));
