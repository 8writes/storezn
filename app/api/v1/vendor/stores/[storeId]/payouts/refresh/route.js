import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { syncStoreSettlements } from "../../../../../../../../lib/settlementSync.js";

// On-demand version of the settlement-poll cron (see
// app/api/cron/settlement-poll/route.js) - lets a vendor hit "Check
// settlements" on the Payouts page instead of waiting for the next
// scheduled run.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!store.subAccountCode) {
    return NextResponse.json({ error: "No payout account linked yet" }, { status: 400 });
  }

  try {
    const updated = await syncStoreSettlements(store);
    return NextResponse.json({ updated });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not check settlements" }, { status: 502 });
  }
}
