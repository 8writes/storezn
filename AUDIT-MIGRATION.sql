-- Migration for the audit fixes. Run once against the production Neon DB
-- (server deploy does NOT run drizzle-kit push). Safe to re-run - every
-- statement is guarded.
--
--   psql "$DATABASE_URL" -f AUDIT-MIGRATION.sql
--
-- ============================================================================
-- 1. refund_requests.reviewed_by: drop the users.id foreign key.
--    A reviewer can be a staff member (staff.id, a separate table since the
--    auth split), so this FK threw a constraint violation on every staff
--    refund approval/decline. reviewed_by is now a plain audit column.
-- ============================================================================
-- Drop by the drizzle-kit default name, plus a dynamic sweep of any other
-- FK constraint that happens to sit on refund_requests.reviewed_by.
ALTER TABLE refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_reviewed_by_users_id_fk;

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND rel.relname = 'refund_requests'
      AND att.attname = 'reviewed_by'
  LOOP
    EXECUTE format('ALTER TABLE refund_requests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- ============================================================================
-- 2. refund_requests: one request per order.
--    The request route check-then-inserts, so two concurrent submits could
--    both pass and create duplicate rows. Collapse any existing duplicates
--    (keep the earliest), then add the unique index the code now relies on.
-- ============================================================================
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn
  FROM refund_requests
)
DELETE FROM refund_requests
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_order_id
  ON refund_requests (order_id);

-- The plain index is now redundant with the unique one above.
DROP INDEX IF EXISTS idx_refund_requests_order_id;
