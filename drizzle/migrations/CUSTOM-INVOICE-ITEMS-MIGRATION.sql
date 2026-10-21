-- Offline quotes/invoices can carry custom lines typed in by name, with no
-- catalogue product behind them. Idempotent (DROP NOT NULL is a no-op when
-- already nullable). invoice_items.product_id is already nullable.
ALTER TABLE "invoice_request_items" ALTER COLUMN "product_id" DROP NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "product_id" DROP NOT NULL;
