-- Register cash basis + per-store review tolerance.
--
-- THE BUG THIS FIXES: the open side and the close side were measuring two
-- different piles of cash.
--
--   OPEN  asked for "Cash physically in drawer now - include cash carried
--         over from the previous shift", so pos_sessions.opening_float
--         included the change pot (the small notes under CHANGE_FLOAT_BELOW
--         kept purely for giving change - see lib/pos.js).
--   CLOSE counts only notes >= N500 and stores the pot separately in
--         closing_change_cash, deliberately OUTSIDE the count.
--
-- With opening_float including the pot and counted_cash excluding it,
--   over_short = counted - expected  collapses to  -(pot)
-- so every shift read short by roughly the whole kitty. With the review
-- trigger at N500 that flagged essentially every close, which buried real
-- variances in noise - the opposite of what the review queue is for.
--
-- The fix is to exclude the pot from BOTH sides. That leaves a residual of
-- the shift's net small-note churn (a cashier breaking a N1,000 note into
-- N100s reads N1,000 short), which is real and can be a few thousand naira
-- either way - hence the tolerance column below rather than a tighter
-- literal.
--
-- Two additive columns and one defaulted column. No backfill, nothing
-- retroactive: historical rows keep their figures exactly as issued.
--
-- Idempotent; safe to re-run. Run against production BEFORE deploying the
-- matching code - drizzle names every column in its select(), so deploying
-- first breaks every query against pos_sessions and stores.

-- Which pile opening_float measured. NULL on every historical row, which
-- the Z renderer reads as the OLD basis (pot included) and labels as such,
-- the same treatment z_report.cashSplitTies already gets for snapshots
-- stored before it existed. Deliberately NOT backfilled: we cannot know
-- after the fact which pile a cashier actually put in that box.
--   'all_cash'      - everything physically in the drawer, pot included (old)
--   'counted_notes' - notes >= CHANGE_FLOAT_BELOW only, pot excluded (new)
ALTER TABLE "pos_sessions"
  ADD COLUMN IF NOT EXISTS "opening_basis" text;

-- The change pot's value when the shift opened, kobo. NULL means "not
-- recorded", which must read differently from a counted zero. Recorded for
-- the Z only - never part of expected_cash or counted_cash, exactly like
-- closing_change_cash.
ALTER TABLE "pos_sessions"
  ADD COLUMN IF NOT EXISTS "opening_change_cash" integer;

-- Per-store |over_short| at or above which a close goes to owner review.
-- Replaces the inline 50_000 (N500) literal that used to live in the close
-- route. Default 500000 kobo = N5,000: the counted-notes basis carries
-- irreducible small-note churn of roughly the size of the change pot, so a
-- tighter default would just recreate the noisy queue this migration
-- exists to remove. See posOverShortReview in lib/pos.js.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "pos_over_short_tolerance" integer NOT NULL DEFAULT 500000;
