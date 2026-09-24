-- Optional marketing-email consent captured at signup (vendor + customer).
-- Defaults false; only set true when the person ticks the box.
ALTER TABLE users     ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;
