import { NextResponse } from "next/server";
import { failStaleTransactions, reconcilePendingCheckoutPayments, reconcileReleasedCheckoutPayments } from "../../../../lib/failStaleTransactions.js";

// Triggered by an external scheduler (not a Vercel cron - see the
// platform owner's call not to configure any cron in vercel.json, same
// as settlement-poll), which must send this header - without it anyone
// could hit the route and mass-fail pending orders. Suggested schedule:
// hourly. Manual counterpart at
// /api/v1/super-admin/transactions/fail-stale for the admin dashboard
// button - both call the same failStaleTransactions().
export async function GET(req) {
  const auth = req.headers.get("authorization");
  // Fail closed if the secret isn't configured - otherwise the check
  // becomes `auth !== "Bearer undefined"`, which a request literally
  // sending `Authorization: Bearer undefined` would pass.
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reconciled = await reconcilePendingCheckoutPayments();
  const recoveredReleased = await reconcileReleasedCheckoutPayments();
  const stale = await failStaleTransactions();
  return NextResponse.json({ ok: true, reconciled, recoveredReleased, stale });
}
