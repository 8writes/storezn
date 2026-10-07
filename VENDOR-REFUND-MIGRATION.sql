-- Vendor-initiated refunds on online orders.
--
-- Until now a refund could only exist if a logged-in customer asked for
-- one within the return window, so a guest order could never be refunded
-- at all and the store could never start one itself. See
-- POST /api/v1/vendor/stores/[storeId]/orders/[id]/refund.
--
--   requested_by      now nullable  - NULL = the store started it
--   initiated_by      who on the store side did (users.id or staff.id,
--                     unconstrained for the same reason as reviewed_by)
--   initiated_by_name display label captured at the time
--   amount            refunded amount; NULL = the whole order total,
--                     which is what every pre-existing row means
--
-- Run against production BEFORE deploying the matching code. Idempotent.
alter table "refund_requests"
  alter column "requested_by" drop not null;

alter table "refund_requests"
  add column if not exists "initiated_by" text,
  add column if not exists "initiated_by_name" text,
  add column if not exists "amount" real;
