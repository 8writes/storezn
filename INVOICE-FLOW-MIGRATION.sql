-- Invoice / negotiated-pricing flow.
-- Safe to run more than once. Run this before deploying code that writes
-- invoice requests or invoice payments.

DO $$ BEGIN
  CREATE TYPE product_sale_mode AS ENUM ('fixed_price', 'invoice_required');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_paid' AFTER 'pending';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_request_status AS ENUM ('new', 'reviewing', 'quoted', 'converted', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'expired', 'void', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_plan AS ENUM ('full', 'deposit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_payment_kind AS ENUM ('full', 'deposit', 'balance', 'external');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sale_mode product_sale_mode NOT NULL DEFAULT 'fixed_price',
  ADD COLUMN IF NOT EXISTS customer_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_paid real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_id text;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS customer_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE orders
SET amount_paid = CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END,
    amount_due = CASE WHEN payment_status = 'paid' THEN 0 ELSE total_amount END
WHERE amount_paid = 0 AND amount_due = 0;

CREATE TABLE IF NOT EXISTS invoice_requests (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  branch_id text REFERENCES branches(id),
  customer_id text REFERENCES customers(id),
  request_number text NOT NULL UNIQUE,
  guest_email text,
  buyer_name text,
  buyer_phone text,
  note text,
  status invoice_request_status NOT NULL DEFAULT 'new',
  created_by text REFERENCES users(id),
  converted_invoice_id text,
  expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_requests_store_id ON invoice_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_status ON invoice_requests(status);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_created_at ON invoice_requests(created_at);

CREATE TABLE IF NOT EXISTS invoice_request_items (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES invoice_requests(id),
  product_id text NOT NULL REFERENCES products(id),
  variant_id text REFERENCES product_variants(id),
  product_name text NOT NULL,
  variant_label text,
  quantity integer NOT NULL,
  customer_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_request_items_request_id ON invoice_request_items(request_id);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  request_id text REFERENCES invoice_requests(id),
  order_id text REFERENCES orders(id),
  invoice_number text NOT NULL UNIQUE,
  share_token text NOT NULL UNIQUE,
  status invoice_status NOT NULL DEFAULT 'draft',
  plan invoice_plan NOT NULL DEFAULT 'full',
  total_amount real NOT NULL,
  amount_paid real NOT NULL DEFAULT 0,
  amount_due real NOT NULL,
  deposit_amount real,
  guest_email text,
  buyer_name text,
  buyer_phone text,
  note text,
  currency text NOT NULL DEFAULT 'NGN',
  expires_at timestamp,
  sent_at timestamp,
  accepted_at timestamp,
  paid_at timestamp,
  created_by text REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_store_id ON invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_expires_at ON invoices(expires_at);

DO $$ BEGIN
  ALTER TABLE invoice_requests
    ADD CONSTRAINT fk_invoice_requests_converted_invoice
    FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT fk_orders_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id),
  product_id text REFERENCES products(id),
  variant_id text REFERENCES product_variants(id),
  product_name text NOT NULL,
  variant_label text,
  quantity integer NOT NULL,
  unit_price real NOT NULL,
  line_total real NOT NULL,
  customer_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id),
  order_id text REFERENCES orders(id),
  payment_reference text NOT NULL UNIQUE,
  paystack_transaction_id text UNIQUE,
  kind invoice_payment_kind NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  amount real NOT NULL,
  authorization_url text,
  authorization_expires_at timestamp,
  paid_at timestamp,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_status ON invoice_payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payments_pending_invoice ON invoice_payments(invoice_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS vendor_product_form_preferences (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  user_id text NOT NULL,
  visible_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  section_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  collapsed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_vendor_product_form_preferences_owner UNIQUE (store_id, user_id)
);
