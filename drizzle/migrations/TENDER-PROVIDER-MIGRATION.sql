-- Which POS terminal / provider a card payment went through (Moniepoint,
-- Opay, ...), so payments reconcile per machine. Nullable - only set for
-- the "card" tender method.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f TENDER-PROVIDER-MIGRATION.sql

ALTER TABLE order_tenders ADD COLUMN IF NOT EXISTS provider text;
