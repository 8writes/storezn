-- International payments for invoices (request-a-quote products).
--
-- On a store that accepts international payments, the storefront quote
-- request asks the same question as checkout: "Paying with a card from
-- outside Nigeria?". The answer is stored on the request, and the
-- vendor's invoice is then priced with the international fees from the
-- start (lib/feePolicy.js) - an invoice total is fixed when it's created
-- and can be paid in parts, so the choice can't be left until payment.
-- The resulting order carries orders.international like a checkout order.
--
-- Idempotent. Run against production BEFORE deploying the matching code.

ALTER TABLE "invoice_requests"
  ADD COLUMN IF NOT EXISTS "international" boolean NOT NULL DEFAULT false;
