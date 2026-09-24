ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_authorization_url" text,
  ADD COLUMN IF NOT EXISTS "payment_authorization_expires_at" timestamp;
