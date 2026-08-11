import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { getDomainConfig, getProjectDomain } from "../../../../../../../lib/vercel.js";
import { dnsInstructionsFor } from "../../../../../../../lib/domain.js";

// On-demand re-check of a store's custom domain against Vercel, called by
// the vendor's "Check status" button (see vendor/settings/page.js) and by
// the domain-status-poll cron (app/api/cron/domain-status-poll/route.js)
// for every store still "pending_dns" - same check, two triggers.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!store.customDomain) {
    return NextResponse.json({ domainStatus: "none" });
  }

  const domainStatus = await refreshDomainStatus(store);
  return NextResponse.json({
    domainStatus,
    dnsInstructions: dnsInstructionsFor(store.customDomain),
    domainVerification: domainStatus === "verified" ? null : store.domainVerification,
  });
}

// Shared with the cron poller - a domain counts as fully live once DNS is
// pointed at Vercel (not misconfigured) AND, if Vercel raised an
// ownership challenge when the domain was added (store.domainVerification,
// see lib/vercel.js's addProjectDomain), that challenge has since resolved.
export async function refreshDomainStatus(store) {
  const [config, project] = await Promise.all([
    getDomainConfig(store.customDomain),
    store.domainVerification ? getProjectDomain(store.customDomain) : Promise.resolve({ verified: true }),
  ]);

  const isLive = !config.misconfigured && project.verified;
  const domainStatus = isLive ? "verified" : "pending_dns";

  if (domainStatus !== store.domainStatus || (isLive && store.domainVerification)) {
    await db
      .update(stores)
      .set({ domainStatus, domainVerification: isLive ? null : store.domainVerification })
      .where(eq(stores.id, store.id));
  }

  return domainStatus;
}
