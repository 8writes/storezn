-- One-off data fix, not a schema change: a cashier recorded "bread
-- bought" (money that left the drawer) as a "Paid in" instead of a
-- "Paid out". There's no in-app edit for a cash movement on purpose -
-- see the POST handler in
-- app/api/v1/vendor/stores/[storeId]/pos/sessions/[id]/movements/route.js
-- - the ledger is meant to be append-only for the forensic report to
-- mean anything, so this is corrected by hand, once, against prod.
--
-- Row identified from the vendor's report:
--   "Paid in +N29,600.00 - bread bought (RAPHAEL UDOCHUKWU) - 12 Sept 2026, 7:43 am"
--
-- Run in this order, on the Neon prod DB (storezn-temp) - e.g. via
-- `psql "$NEON_DATABASE_URL" -f FIX-MISRECORDED-CASH-MOVEMENT.sql` or
-- pasted into Neon's SQL editor.

-- ============================================================
-- STEP 1 - confirm this matches exactly ONE row before touching anything.
-- created_at's window is a full day (not a tight few minutes) since it's
-- just a sanity check here - kind + amount + reason + who recorded it
-- already pin this down to one movement.
-- ============================================================
select
  cm.id,
  cm.session_id,
  cm.kind,
  cm.amount,             -- kobo; 2960000 = N29,600.00
  cm.reason,
  cm.created_at,
  coalesce(s.first_name || ' ' || s.last_name, u.first_name || ' ' || u.last_name) as recorded_by,
  ps.status as session_status,
  ps.expected_cash,
  ps.counted_cash,
  ps.over_short
from cash_movements cm
left join staff s on s.id = cm.created_by
left join users u on u.id = cm.created_by
left join pos_sessions ps on ps.id = cm.session_id
where cm.kind = 'paid_in'
  and cm.amount = 2960000
  and cm.reason ilike '%bread%'
  and cm.created_at >= '2026-09-12 00:00:00'
  and cm.created_at <  '2026-09-13 00:00:00';

-- ============================================================
-- STEP 2 - only once Step 1 returned exactly that one row (double-check
-- recorded_by = Raphael Udochukwu), run this whole block as one
-- transaction. It flips the movement to paid_out, and - only if the
-- shift it belongs to has already been closed - corrects the cached
-- expected-cash / over-short snapshot on pos_sessions to match (those
-- are computed once at close time from computeDrawer() in lib/pos.js
-- and stored, not recalculated live; an OPEN session needs no such fix,
-- it computes both live on every read).
-- ============================================================
begin;

with fixed as (
  update cash_movements
  set kind = 'paid_out', amount = -2960000
  where kind = 'paid_in'
    and amount = 2960000
    and reason ilike '%bread%'
    and created_at >= '2026-09-12 00:00:00'
    and created_at <  '2026-09-13 00:00:00'
  returning session_id
)
update pos_sessions
set
  -- swing is -5,920,000 kobo: the old +29,600 is removed AND the
  -- correct -29,600 is added, twice the amount either way.
  expected_cash = expected_cash - 5920000,
  over_short = case
    when counted_cash is not null then counted_cash - (expected_cash - 5920000)
    else over_short
  end
where id in (select session_id from fixed)
  and status = 'closed'
returning id, status, expected_cash, counted_cash, over_short;

commit;
