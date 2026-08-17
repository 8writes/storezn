import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { stores, platformSettings, branches } from "../../../../../../lib/db/schema.js";
import { eq, count } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../lib/auth.js";
import { validate, updateVendorStoreSchema } from "../../../../../../lib/validate.js";
import { deletePublicFile } from "../../../../../../lib/storage/index.js";
import { removeStoreUpload, getStoreStorageUsage } from "../../../../../../lib/storeUploads.js";
import { isPlusStore, getStorageLimitBytes } from "../../../../../../lib/storePlan.js";
import { isColorTooLight } from "../../../../../../lib/colorShades.js";

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
  // Flat fee is platform-wide only (no per-store override, unlike the
  // commission rate) - see platformSettings.defaultFlatFee.
  const effectiveFlatFee = settings?.defaultFlatFee ?? 0;
  const isPlus = isPlusStore(store);
  const plusMonthlyPrice = settings?.plusMonthlyPrice ?? 5000;
  const storageUsedBytes = await getStoreStorageUsage(storeId);
  const storageLimitBytes = getStorageLimitBytes(store, settings || { freeStorageMb: 500, plusStorageMb: 5000 });
  // Available to any canManageStore user (staff included), unlike the
  // owner-only /branches list route - just the count, so a staff member
  // can tell whether the plain product Stock field should be disabled in
  // favor of Stock by branch, without needing team-management access.
  const [{ branchCount }] = await db.select({ branchCount: count() }).from(branches).where(eq(branches.storeId, storeId));

  return NextResponse.json({
    store,
    effectiveCommissionRatePercent,
    effectiveFlatFee,
    isPlus,
    plusMonthlyPrice,
    storageUsedBytes,
    storageLimitBytes,
    branchCount,
  });
}

// Self-service fields only (logo, socials, who pays the commission) - the
// payout account itself is verified through
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

  if ("storefrontAccentColor" in result.data && !isPlusStore(store)) {
    return NextResponse.json({ error: "Storefront theme color is a Storezn+ feature" }, { status: 402 });
  }

  // The header/footer render white text over this color once set (see
  // app/storefront/[host]/layout.js's `themed`) - a white/near-white pick
  // would make that text unreadable, so it's rejected here too, not just
  // client-side (see isColorTooLight's own comment for the threshold).
  if (result.data.storefrontAccentColor && isColorTooLight(result.data.storefrontAccentColor)) {
    return NextResponse.json({ error: "That color is too close to white - your header/footer text would be unreadable" }, { status: 400 });
  }

  // Empty string means "clear this field", distinct from omitting the key
  // entirely (which leaves it untouched).
  const data = {};
  for (const [key, value] of Object.entries(result.data)) {
    data[key] = value === "" ? null : value;
  }

  const [updated] = await db.update(stores).set(data).where(eq(stores.id, storeId)).returning();

  const stale = REPLACEABLE_IMAGE_FIELDS.filter((field) => field in data && store[field] && store[field] !== data[field]).map((field) => store[field]);
  if (stale.length > 0) {
    Promise.all(stale.map((url) => Promise.all([deletePublicFile(url), removeStoreUpload(url)]))).catch(() => {});
  }

  return NextResponse.json({ store: updated });
}
