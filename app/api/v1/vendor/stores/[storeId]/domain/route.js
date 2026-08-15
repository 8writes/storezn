import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../lib/db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { validate, setCustomDomainSchema } from "../../../../../../../lib/validate.js";
import { isPlusStore } from "../../../../../../../lib/storePlan.js";

// storezn.com itself and any *.storezn.com subdomain are already how
// every store is reachable by default (see lib/resolveStore.js) - a
// vendor "adding" either as their custom domain would just be pointless,
// and letting them claim the bare root domain especially would be a way
// to hijack routing for every other store, not just their own.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";

function isReservedDomain(domain) {
  return domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`);
}

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Owner-only, same as payout-account - a domain change affects where
// every one of this store's customers land, that's not a staff-level
// decision (see canManageStore vs isStoreOwner in lib/auth.js).
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(setCustomDomainSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { customDomain } = result.data;

  if (!customDomain) {
    const [updated] = await db
      .update(stores)
      .set({ customDomain: null, domainStatus: "none", domainVerification: null })
      .where(eq(stores.id, storeId))
      .returning();
    return NextResponse.json({ store: updated });
  }

  if (!isPlusStore(store)) {
    return NextResponse.json({ error: "Custom domains are a Storezn+ feature" }, { status: 402 });
  }

  if (isReservedDomain(customDomain)) {
    return NextResponse.json({ error: `${customDomain} isn't available - it's already how storezn stores are reached` }, { status: 400 });
  }

  const [taken] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.customDomain, customDomain), ne(stores.id, storeId)))
    .limit(1);
  if (taken) {
    return NextResponse.json({ error: "That domain is already linked to another store" }, { status: 409 });
  }

  // Always resets to pending_dns, even on a re-save of the same value -
  // if a vendor is re-submitting, it's usually because verification
  // failed and they've since fixed their DNS, so re-checking is exactly
  // what should happen next (see .../domain/verify).
  const [updated] = await db
    .update(stores)
    .set({ customDomain, domainStatus: "pending_dns", domainVerification: null })
    .where(eq(stores.id, storeId))
    .returning();

  return NextResponse.json({ store: updated });
}
