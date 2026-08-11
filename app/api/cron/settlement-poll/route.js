import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores } from "../../../../../lib/db/schema.js";
import { isNotNull } from "drizzle-orm";
import { syncStoreSettlements } from "../../../../../lib/settlementSync.js";

// Vercel invokes crons (see vercel.json) with this header when
// CRON_SECRET is set - without this check anyone could hit the route and
// trigger a burst of Vercel API calls.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withPayouts = await db.select().from(stores).where(isNotNull(stores.subAccountCode));

  const results = await Promise.allSettled(withPayouts.map((store) => syncStoreSettlements(store)));
  const updated = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);

  return NextResponse.json({ storesChecked: withPayouts.length, ordersSettled: updated });
}
