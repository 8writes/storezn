CREATE TABLE IF NOT EXISTS "checkout_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text NOT NULL REFERENCES "stores"("id"),
  "branch_id" text REFERENCES "branches"("id"),
  "user_id" text REFERENCES "customers"("id"),
  "cart_id" text REFERENCES "carts"("id"),
  "order_number" text NOT NULL UNIQUE,
  "guest_email" text,
  "customer_name" text,
  "subtotal" real NOT NULL,
  "shipping_fee" real NOT NULL DEFAULT 0,
  "shipping_fee_tbd" boolean NOT NULL DEFAULT false,
  "total_amount" real NOT NULL,
  "commission_rate_percent" real NOT NULL,
  "commission_amount" real NOT NULL,
  "flat_fee_amount" real NOT NULL DEFAULT 0,
  "vendor_payout_amount" real NOT NULL,
  "fee_charged_to_customer" boolean NOT NULL DEFAULT false,
  "shipping_address" jsonb,
  "note" text,
  "items" jsonb NOT NULL,
  "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
  "payment_reference" text NOT NULL UNIQUE,
  "payment_authorization_url" text,
  "payment_authorization_expires_at" timestamp,
  "paid_at" timestamp,
  "order_id" text REFERENCES "orders"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_checkout_attempts_store_id" ON "checkout_attempts" ("store_id");
CREATE INDEX IF NOT EXISTS "idx_checkout_attempts_cart_id" ON "checkout_attempts" ("cart_id");
CREATE INDEX IF NOT EXISTS "idx_checkout_attempts_payment_status" ON "checkout_attempts" ("payment_status");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_checkout_attempts_cart_pending"
  ON "checkout_attempts" ("cart_id")
  WHERE "payment_status" = 'pending';
