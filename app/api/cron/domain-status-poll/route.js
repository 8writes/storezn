import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores } from "../../../../../lib/db/schema.js";
import { and, eq, isNotNull } from "drizzle-orm";
import { refreshDomainStatus } from "../../../vendor/stores/[storeId]/domain-status/route.js";

// Vercel invokes crons (see vercel.json) with this header when
// CRON_SECRET is set - without this check anyone could hit the route and
// trigger a burst of Vercel API calls.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select()
    .from(stores)
    .where(and(eq(stores.domainStatus, "pending_dns"), isNotNull(stores.customDomain)));

  const results = await Promise.allSettled(pending.map((store) => refreshDomainStatus(store)));
  const verified = results.filter((r) => r.status === "fulfilled" && r.value === "verified").length;

  return NextResponse.json({ checked: pending.length, verified });
}
