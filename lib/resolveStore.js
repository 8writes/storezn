import { db } from "./db/index.js";
import { stores, users } from "./db/schema.js";
import { and, eq, or } from "drizzle-orm";
import { isPlusStore } from "./storePlan.js";

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
// The platform's own host (dashboard/marketing/super-admin), as opposed
// to a store's subdomain or custom domain - same check proxy.js's
// middleware already does to decide whether to rewrite into the
// storefront route group. Used by the auth routes to decide whether a
// login/forgot-password/etc request means "look in users/staff" (typed
// on storezn.com) or "look in customers, scoped to this store" (typed on
// a store's own host).
export function isPlatformHost(host) {
  const hostname = (host || "").split(":")[0];
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").split(":")[0];
  return hostname === rootDomain || hostname === `www.${rootDomain}`;
}

export async function resolveStoreByHost(host) {
  // Stripped of port - a Host header in local dev is "demo.localhost:3000",
  // but NEXT_PUBLIC_ROOT_DOMAIN and stores.customDomain are always bare
  // hostnames, comparing the raw header (port included) against either
  // would never match outside of production's default-port domains.
  const hostname = host.split(":")[0];
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";
  const slug = hostname.endsWith(`.${rootDomain}`) ? hostname.slice(0, -(rootDomain.length + 1)) : null;

  // A custom domain only routes here once it's been verified - a set but
  // still-pending domain isn't live, so an unverified match must never
  // resolve to the store (same bar as getStorefrontUrl and the SSL
  // provisioning check in /api/v1/domain-check).
  const conditions = [and(eq(stores.customDomain, hostname), eq(stores.domainStatus, "verified"))];
  if (slug) conditions.push(eq(stores.slug, slug));

  const [row] = await db
    .select({ store: stores, ownerApprovalStatus: users.approvalStatus })
    .from(stores)
    .innerJoin(users, eq(stores.ownerId, users.id))
    .where(or(...conditions))
    .limit(1);
  if (!row) return null;

  // Custom domain is a Storezn+-exclusive perk (see stores.customDomain's
  // own signup gate at PATCH .../domain) - `slug` above is only ever set
  // when the hostname ends in the platform's own root domain, so a null
  // slug here means this could only have matched via customDomain. Re-
  // checking the plan on every single request (not just at the time the
  // domain was set) is what actually enforces that once a subscription
  // lapses, instead of the domain quietly continuing to work forever off
  // one past payment - getEffectivePlan already self-heals to "free" on
  // read, so this needs no separate expiry job of its own.
  if (!slug && !isPlusStore(row.store)) return null;

  return { ...row.store, ownerApprovalStatus: row.ownerApprovalStatus };
}

// A store is only visible/sellable once it's in good standing (isActive,
// independent super_admin suspension), its owner's identity is verified
// (ownerApprovalStatus, see resolveStoreByHost above), and the vendor
// hasn't closed it themselves (isOpen).
export function isStoreLive(store) {
  return !!store?.isActive && !!store?.isOpen && store?.ownerApprovalStatus === "approved";
}
