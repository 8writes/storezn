import { db } from "./db/index.js";
import { stores, users } from "./db/schema.js";
import { eq, or } from "drizzle-orm";

// Given a request Host header, figures out which store (if any) it maps
// to: either an exact custom-domain match, or a `<slug>.<rootDomain>`
// subdomain. Runs server-side (Node runtime), not in middleware itself -
// Edge middleware can't safely run a full Postgres client, so middleware
// just rewrites by raw host and this does the actual DB lookup.
//
// Joins in the owning vendor's approvalStatus (see users.approvalStatus
// in lib/db/schema.js) as `ownerApprovalStatus` on the returned object -
// every caller that decides whether a store can actually be shown to /
// sell to a customer (storefront layout, checkout) needs this alongside
// stores.isActive, and joining it here once means neither of those has
// to know how ownership/approval is modeled.
export async function resolveStoreByHost(host) {
  // Stripped of port - a Host header in local dev is "demo.localhost:3000",
  // but NEXT_PUBLIC_ROOT_DOMAIN and stores.customDomain are always bare
  // hostnames, comparing the raw header (port included) against either
  // would never match outside of production's default-port domains.
  const hostname = host.split(":")[0];
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";
  const slug = hostname.endsWith(`.${rootDomain}`) ? hostname.slice(0, -(rootDomain.length + 1)) : null;

  const conditions = [eq(stores.customDomain, hostname)];
  if (slug) conditions.push(eq(stores.slug, slug));

  const [row] = await db
    .select({ store: stores, ownerApprovalStatus: users.approvalStatus })
    .from(stores)
    .innerJoin(users, eq(stores.ownerId, users.id))
    .where(or(...conditions))
    .limit(1);
  if (!row) return null;
  return { ...row.store, ownerApprovalStatus: row.ownerApprovalStatus };
}

// A store is only visible/sellable once it's in good standing (isActive,
// independent super_admin suspension), its owner's identity is verified
// (ownerApprovalStatus, see resolveStoreByHost above), and the vendor
// hasn't closed it themselves (isOpen).
export function isStoreLive(store) {
  return !!store?.isActive && !!store?.isOpen && store?.ownerApprovalStatus === "approved";
}
