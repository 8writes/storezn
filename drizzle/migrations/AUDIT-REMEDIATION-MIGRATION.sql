-- Schema changes from the 2026-09-26 repository audit remediation.
-- See docs/AUDIT-2026-09-26.md (findings F-06 and F-09).
--
-- Run this against the database BEFORE deploying the matching code, as
-- with every other migration here. All statements are additive and
-- idempotent; nothing is dropped and no existing row is rewritten.

-- ---------------------------------------------------------------------
-- F-09: password changes must invalidate already-issued JWTs.
--
-- Tokens are stateless and live 30 days, so before this a password reset
-- did not evict whoever else was holding one - which is the whole reason
-- someone resets a password after a compromise. getUser (lib/auth.js)
-- now rejects any token whose `iat` predates this timestamp.
--
-- Left NULL for every existing row on purpose: NULL means "no password
-- change recorded", so current sessions stay valid and nobody is logged
-- out by the deploy itself.
-- ---------------------------------------------------------------------
ALTER TABLE users     ADD COLUMN IF NOT EXISTS password_changed_at timestamp;
ALTER TABLE staff     ADD COLUMN IF NOT EXISTS password_changed_at timestamp;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_changed_at timestamp;

-- ---------------------------------------------------------------------
-- F-06: vendor self-signup email uniqueness was not normalized.
--
-- `customers` already had this column and index; `users` did not, so one
-- mailbox could become several vendor accounts (and therefore several
-- stores) through Gmail dot aliases. signupEmail already rejected +tags.
--
-- Deliberately NOT backfilled: computing the normalized form for existing
-- rows could surface a collision between two accounts that are both live
-- and in use, and this migration must not be the thing that decides which
-- of them to break. New signups populate it; the partial index below only
-- covers rows that actually have a value, so existing accounts are
-- unaffected either way. Backfilling is a separate, reviewed exercise.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_email text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_normalized_email
  ON users (normalized_email)
  WHERE deleted_at IS NULL AND normalized_email IS NOT NULL;
