-- One-off data correction, on the owner's instruction (2026-10-16):
-- clear every outstanding register review flag.
--
-- The store stopped comparing the drawer count with an expected figure,
-- so flags raised under the old over/short rule no longer have a reason
-- the owner can see. From here on a shift is flagged only for a reason
-- the system states on the shift page (not counted / sales unsynced /
-- a sale synced after close).
--
-- At the time of writing this matched three rows: 2026-09-07 (closed
-- without counting), 2026-10-14 and 2026-10-15 (flagged by the old
-- over/short threshold).
--
-- Touches ONLY the review flag. counted_cash, expected_cash, over_short
-- and every other figure stay exactly as issued. Approvals already made
-- by a person are not overwritten. Idempotent: a re-run matches nothing.

UPDATE "pos_sessions"
SET
  "review_status" = 'approved',
  "reviewed_at" = now(),
  "review_note" = 'Cleared on the owner''s instruction when the store stopped comparing the drawer count with an expected figure.'
WHERE "status" = 'closed'
  AND "review_status" = 'pending';
