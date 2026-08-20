import { NextResponse } from "next/server";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { failStaleTransactions } from "../../../../../../lib/failStaleTransactions.js";
import { logActivity } from "../../../../../../lib/activityLog.js";

// Manual counterpart to app/api/cron/fail-stale-transactions - same
// underlying logic, triggered on demand from the admin Transactions page
// instead of on a schedule.
export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await failStaleTransactions();

  await logActivity({ user, action: "transaction.fail_stale", metadata: result });

  return NextResponse.json({ ok: true, ...result });
}
