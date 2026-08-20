import { NextResponse } from "next/server";
import { db } from "../../../../lib/db/index.js";
import { stores } from "../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { isPlusStore } from "../../../../lib/storePlan.js";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";

// Caddy's on-demand TLS "ask" endpoint (see the storezn.com block in the
// server's Caddyfile) - called once per hostname Caddy has never seen a
// cert request for, before it talks to Let's Encrypt at all. A bare 200
// approves issuing a certificate for that exact hostname; anything else
// denies it. This is the entire replacement for the old Vercel Domains
// API integration: instead of us telling Vercel "this domain belongs to
// this project", we tell Caddy "yes, go ahead and get a cert for this"
// on demand, and only for domains that are actually ours to serve.
//
// No auth on this route on purpose - Caddy calls it unauthenticated by
// design (see its docs), and it only ever answers a yes/no about
// hostnames, never returns any store data.
export async function GET(req) {
  const domain = new URL(req.url).searchParams.get("domain")?.toLowerCase().trim();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) {
    return NextResponse.json({ ok: true });
  }

  const [store] = await db
    .select({ id: stores.id, plan: stores.plan, planCancelled: stores.planCancelled, planRenewsAt: stores.planRenewsAt })
    .from(stores)
    .where(and(eq(stores.customDomain, domain), eq(stores.domainStatus, "verified")))
    .limit(1);

  if (!store) return NextResponse.json({ error: "Domain not recognized" }, { status: 403 });
  // Custom domain is Storezn+-exclusive (see lib/resolveStore.js's
  // matching check) - denying cert issuance/renewal here too means a
  // lapsed store's domain stops being servable over HTTPS at all, not
  // just unresolved at the app layer, closing the same gap from the TLS
  // side as well.
  if (!isPlusStore(store)) return NextResponse.json({ error: "Domain not on an active Storezn+ plan" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
