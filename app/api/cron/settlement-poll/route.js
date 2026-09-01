import { NextResponse } from "next/server";
import { db } from "../../../../lib/db/index.js";
import { stores } from "../../../../lib/db/schema.js";
import { isNotNull } from "drizzle-orm";
import { syncStoreSettlements } from "../../../../lib/settlementSync.js";

// Triggered by an external scheduler (not a Vercel cron - see the
// platform owner's call not to configure any cron in vercel.json), which
// must send this header - without it anyone could hit the route and
// trigger a burst of Paystack API calls.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  // Fail closed if the secret isn't configured - otherwise the check
  // becomes `auth !== "Bearer undefined"`, which a request literally
  // sending `Authorization: Bearer undefined` would pass.
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withPayouts = await db.select().from(stores).where(isNotNull(stores.subAccountCode));

  const results = await Promise.allSettled(withPayouts.map((store) => syncStoreSettlements(store)));
  const updated = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);

  return NextResponse.json({ storesChecked: withPayouts.length, ordersSettled: updated });
}
