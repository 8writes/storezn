-- Signup abuse guards:
--  1. customers.normalized_email - "+tag" (and Gmail dots) stripped, so a
--     single mailbox can't farm many accounts. Real uniqueness key.
--  2. blocked_emails - a super-admin barred-list of emails / domains.
-- Additive + safe on live data.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS normalized_email text;

-- Backfill existing rows (mirror lib/emailNormalize.js).
UPDATE customers
SET normalized_email =
  CASE
    WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      THEN regexp_replace(regexp_replace(lower(split_part(email, '@', 1)), '\+.*$', ''), '\.', '', 'g') || '@gmail.com'
    ELSE regexp_replace(lower(split_part(email, '@', 1)), '\+.*$', '') || '@' || lower(split_part(email, '@', 2))
  END
WHERE normalized_email IS NULL AND email LIKE '%@%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_store_normalized_email
  ON customers (store_id, normalized_email)
  WHERE deleted_at IS NULL AND normalized_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS blocked_emails (
  id         text PRIMARY KEY,
  value      text NOT NULL,
  kind       text NOT NULL,
  reason     text,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_blocked_emails_value_kind ON blocked_emails (value, kind);
