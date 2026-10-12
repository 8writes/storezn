-- stores.fee_charged_to_customer: default to TRUE, and move every
-- existing store onto it.
--
-- This decides who pays the gateway fee on an online order. FALSE (the
-- old default) means the buyer pays exactly subtotal + shipping and the
-- fee comes out of the vendor's payout; TRUE adds it on top of what the
-- buyer pays and the vendor keeps their full subtotal + shipping. See
-- computeOrderTotals in lib/orders.js.
--
-- NOTE: this changes what shoppers are charged. Every store that was
-- absorbing the fee will, from the next order, show it as a separate line
-- and collect it from the buyer instead. Vendors can still switch back
-- individually from their store settings - this only moves the starting
-- position and brings the existing stores in line with it.
--
-- Historical orders and invoices are untouched: those rows snapshot the
-- setting as it was when they were placed, and rewriting them would
-- falsify what a past buyer actually paid.
--
-- Run against production BEFORE deploying the matching code. Idempotent.

alter table "stores"
  alter column "fee_charged_to_customer" set default true;

update "stores"
   set "fee_charged_to_customer" = true
 where "fee_charged_to_customer" = false;
