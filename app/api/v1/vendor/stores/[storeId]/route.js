import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { stores, platformSettings } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../lib/auth.js";
import { validate, updateVendorStoreSchema } from "../../../../../../lib/validate.js";
import { deletePublicFile } from "../../../../../../lib/storage/index.js";
import { addProjectDomain, removeProjectDomain } from "../../../../../../lib/vercel.js";
import { CUSTOM_DOMAINS_ENABLED } from "../../../../../../lib/featureFlags.js";

// The two upload-backed fields - PATCHing over (or clearing) either one
// orphans the previous file in storage unless we clean it up here.
const REPLACEABLE_IMAGE_FIELDS = ["logoUrl", "faviconUrl"];

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // store.commissionRatePercent is null unless a super_admin has set a
  // custom rate for this specific store (see /api/v1/super-admin/stores/
  // [id]) - this surfaces the rate that's actually applied at checkout
  // either way, so the vendor isn't left guessing which one is in effect.
  const [settings] = await db.select().from(platformSettings).limit(1);
  const effectiveCommissionRatePercent = store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5;

  return NextResponse.json({ store, effectiveCommissionRatePercent });
}

// Self-service fields only (logo, custom domain, socials, who pays the
// commission) - the payout account itself is verified through
// /payout-account (Paystack resolves it, so it can't just be pasted in
// here), and isActive/commissionRatePercent are platform-controlled, see
// /api/v1/super-admin/stores/[id].
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateVendorStoreSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Only blocks an actual attempt to set one - the settings form always
  // includes customDomain in its payload (even as "" when the field is
  // disabled), so gating on mere key presence would reject every save,
  // not just domain changes.
  if (!CUSTOM_DOMAINS_ENABLED && result.data.customDomain) {
    return NextResponse.json({ error: "Custom domains aren't available yet" }, { status: 400 });
  }

  // Empty string means "clear this field" (e.g. removing a custom domain),
  // distinct from omitting the key entirely (which leaves it untouched).
  const data = {};
  for (const [key, value] of Object.entries(result.data)) {
    data[key] = value === "" ? null : value;
  }

  // Registering/removing with Vercel is what actually makes the domain
  // route to this app at all (see lib/vercel.js) - done before the DB
  // write so a Vercel-side failure (e.g. domain already claimed
  // elsewhere) doesn't leave the store pointing at a domain that isn't
  // actually wired up.
  if ("customDomain" in data && data.customDomain !== store.customDomain) {
    if (store.customDomain) {
      await removeProjectDomain(store.customDomain).catch(() => {});
    }
    if (data.customDomain) {
      try {
        const { verification } = await addProjectDomain(data.customDomain);
        data.domainVerification = verification;
      } catch (err) {
        return NextResponse.json({ error: err.message || "Could not register domain with Vercel" }, { status: 502 });
      }
    } else {
      data.domainVerification = null;
    }
    data.domainStatus = data.customDomain ? "pending_dns" : "none";
  }

  const [updated] = await db.update(stores).set(data).where(eq(stores.id, storeId)).returning();

  const stale = REPLACEABLE_IMAGE_FIELDS.filter((field) => field in data && store[field] && store[field] !== data[field]).map((field) => store[field]);
  if (stale.length > 0) {
    Promise.all(stale.map((url) => deletePublicFile(url))).catch(() => {});
  }

  return NextResponse.json({ store: updated });
}
