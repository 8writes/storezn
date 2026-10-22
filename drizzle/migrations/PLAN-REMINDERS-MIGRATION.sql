-- Which renewal/end date the "plan ending soon" reminder was sent for
-- (lib/planReminders.js). Idempotent.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "plan_reminder_sent_for" timestamp;
