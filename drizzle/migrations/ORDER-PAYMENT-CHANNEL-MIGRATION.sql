-- How an online (Paystack) payment was made - card, bank_transfer, ussd,
-- apple_pay... from Transaction Verify's `channel`. NULL for till and
-- recorded sales (they use order_tenders) and for online orders paid
-- before this existed. Idempotent.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_channel" text;
