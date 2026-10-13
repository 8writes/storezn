-- One-off data correction: clear the review flags this bug created.
--
-- NOT a schema change, and it touches NO cash figure. counted_cash,
-- expected_cash and over_short are left exactly as they were issued -
-- they are a truthful record of what was entered, and the opening float
-- those shifts should have declared is unknowable after the fact, so
-- "correcting" them would mean inventing it.
--
-- Why these rows were flagged: 38 of 41 sessions opened with the opening
-- float recorded as 0 - the old open screen asked for "cash physically in
-- drawer now" and told the cashier "Enter 0 only when the drawer is
-- empty". The drawer was NOT empty, so each close counted cash that the
-- expected figure never knew about and the shift read over by it (32 of
-- 38 read over, averaging about 7,800 naira). The review trigger was a
-- flat 500 naira, so practically every close was flagged and none was
-- ever approved - 32 unread flags, which is a review queue that cannot
-- do its job.
--
-- Clearing them so the queue starts empty and the next flagged close
-- means something. Each row keeps a note saying why it could not be
-- judged, so the history stays honest rather than looking signed off.
--
-- Deliberately NOT cleared:
--   * close_method = 'forced_uncounted' - that flag is valid and has
--     nothing to do with this bug (nobody counted the drawer at all).
--   * anything already 'approved' - a real human decision is not
--     overwritten.
--   * any shift opened after the fix (opening_basis IS NOT NULL) - those
--     are judgeable and must stay flagged if they are off.
--
-- Idempotent: re-running matches nothing, because the rows it touched are
-- no longer 'pending'.

UPDATE "pos_sessions"
SET
  "review_status" = 'approved',
  "reviewed_at" = now(),
  "review_note" = 'Cleared automatically: this shift opened without the cash already in the drawer being declared (opening float recorded as 0), so its over/short includes that undeclared cash and cannot be judged. No cash figure was changed.'
WHERE "status" = 'closed'
  AND "opening_basis" IS NULL
  AND "review_status" = 'pending'
  AND "close_method" = 'blind_count';
