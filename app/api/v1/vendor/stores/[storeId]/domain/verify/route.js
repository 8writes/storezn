import { NextResponse } from "next/server";
import { resolve4 } from "node:dns/promises";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";

// Vendor-triggered, not automatic - DNS propagation can take anywhere
// from minutes to a day, so this is a button ("Verify now") they click
// once they believe they've set the A record, not something polled in
// the background. A store only actually becomes reachable on its custom
// domain once domainStatus is "verified" - that's what /api/v1/
// domain-check (Caddy's on-demand TLS ask) requires before it'll issue
// a certificate for the domain at all.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!store.customDomain) {
    return NextResponse.json({ error: "No custom domain is set for this store yet" }, { status: 400 });
  }

  const serverIp = process.env.SERVER_IP;
  if (!serverIp) {
    console.error("domain verify: SERVER_IP is not configured");
    return NextResponse.json({ error: "Domain verification isn't available right now - try again shortly" }, { status: 500 });
  }

  let addresses;
  try {
    addresses = await resolve4(store.customDomain);
  } catch {
    return NextResponse.json({
      error: `${store.customDomain} doesn't resolve yet. Point an A record at ${serverIp} and try again once it's live.`,
      domainStatus: "pending_dns",
    }, { status: 400 });
  }

  if (!addresses.includes(serverIp)) {
    return NextResponse.json({
      error: `${store.customDomain} points somewhere else right now. Update its A record to ${serverIp} and try again.`,
      domainStatus: "pending_dns",
    }, { status: 400 });
  }

  const [updated] = await db
    .update(stores)
    .set({ domainStatus: "verified", domainVerification: { verifiedAt: new Date().toISOString(), addresses } })
    .where(eq(stores.id, storeId))
    .returning();

  return NextResponse.json({ store: updated });
}
