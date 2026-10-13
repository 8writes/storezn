import { NextResponse } from "next/server";
import { db } from "@/lib/db/index.js";
import { storeVisits } from "@/lib/db/schema.js";
import { resolveStoreByHost, isStoreLive } from "@/lib/resolveStore.js";
import { checkRateLimit } from "@/lib/rateLimit.js";
import { withApiMonitoring } from "@/lib/apiMonitoring.js";

// Records that a browser looked at this store today.
//
// Deliberately dumb: one row per (store, visitor, day), deduped by a
// unique index, so a shopper browsing all afternoon is one visitor and the
// client never has to reason about it. No page paths, no referrers, no
// profile - the vendor asked how many people looked, and that is all this
// answers.
//
// The visitorId is generated and kept by the shopper's own browser, and
// the beacon only fires once they have accepted analytics cookies (see
// components/storefront/VisitBeacon.js). Anyone who declines is not
// counted rather than tracked another way.
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

async function handlePost(req) {
  // Generous: this is one call per browser per day in normal use, and the
  // cost of a false positive is an undercounted visitor, not a failed
  // order. The cap is here to stop a script inflating a store's numbers.
  const limit = await checkRateLimit(req, "store-visit", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ ok: true, counted: false }, { status: 200 });

  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store || !isStoreLive(store)) return NextResponse.json({ ok: true, counted: false });

  const body = await req.json().catch(() => null);
  const visitorId = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  if (!VISITOR_ID_PATTERN.test(visitorId)) return NextResponse.json({ ok: true, counted: false });

  // Day in UTC, matching how the analytics range is computed.
  const visitDay = new Date().toISOString().slice(0, 10);

  // onConflictDoNothing IS the dedup - a second visit today simply does
  // not insert, so nothing here needs to read before it writes.
  const inserted = await db
    .insert(storeVisits)
    .values({ storeId: store.id, visitorId, visitDay })
    .onConflictDoNothing()
    .returning({ id: storeVisits.id });

  return NextResponse.json({ ok: true, counted: inserted.length > 0 });
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.visit" });
