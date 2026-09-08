import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, branches, products, productBranchStock } from "../../../../../../../lib/db/schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getUser, canManageStore, isStoreOwner } from "../../../../../../../lib/auth.js";
import { setBranchStock } from "../../../../../../../lib/inventory.js";
import { logStoreActivity } from "../../../../../../../lib/storeActivity.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Resolve which branch this request is allowed to read/write. A
// branch-scoped staff member is pinned to their own branch regardless of
// what they ask for; everyone else may pass ?branchId= (or gets the
// default branch). Returns null if the id is bogus / not in this store.
async function resolveBranch(user, storeId, requested) {
  const rows = await db
    .select({ id: branches.id, name: branches.name, isDefault: branches.isDefault })
    .from(branches)
    .where(eq(branches.storeId, storeId))
    .orderBy(branches.createdAt);

  let target;
  if (user.role === "staff" && user.branchId) {
    target = rows.find((b) => b.id === user.branchId);
  } else if (requested) {
    target = rows.find((b) => b.id === requested);
  } else {
    target = rows.find((b) => b.isDefault) || rows[0];
  }
  return { rows, target: target || null };
}

// Per-branch stock for every base (non-variant) product, keyed by
// productId - powers the bulk "edit stock" mode on the products list.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("branchId")?.trim() || null;
  const { rows, target } = await resolveBranch(user, storeId, requested);
  if (!target) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const stockRows = await db
    .select({ productId: productBranchStock.productId, stock: productBranchStock.stock })
    .from(productBranchStock)
    .innerJoin(products, eq(products.id, productBranchStock.productId))
    .where(and(eq(products.storeId, storeId), eq(productBranchStock.branchId, target.id), isNull(productBranchStock.variantId)));

  const stock = {};
  for (const r of stockRows) stock[r.productId] = r.stock;

  return NextResponse.json({
    branchId: target.id,
    branchName: target.name,
    // The full picker is owner-only, matching the dedicated /branches route.
    branches: isStoreOwner(user, store) ? rows.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault })) : undefined,
    stock,
  });
}

// Bulk-set stock for one branch across many products in a single call.
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const updates = Array.isArray(body?.updates) ? body.updates : null;
  if (!updates || updates.length === 0) return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  if (updates.length > 500) return NextResponse.json({ error: "Too many rows in one request" }, { status: 400 });

  const { target } = await resolveBranch(user, storeId, body?.branchId?.trim() || null);
  if (!target) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  // Keep only well-formed rows for products that actually belong to this store.
  const clean = [];
  for (const u of updates) {
    const stock = u?.stock === null ? null : Number(u?.stock);
    if (!u?.productId || (stock !== null && (!Number.isInteger(stock) || stock < 0))) continue;
    clean.push({ productId: String(u.productId), stock });
  }
  if (clean.length === 0) return NextResponse.json({ error: "No valid rows" }, { status: 400 });

  const owned = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.storeId, storeId), inArray(products.id, clean.map((c) => c.productId))));
  const ownedIds = new Set(owned.map((r) => r.id));
  const toApply = clean.filter((c) => ownedIds.has(c.productId));
  if (toApply.length === 0) return NextResponse.json({ error: "No matching products" }, { status: 404 });

  await db.transaction(async (tx) => {
    for (const c of toApply) {
      await setBranchStock(tx, { productId: c.productId, variantId: null, branchId: target.id, stock: c.stock });
    }
  });

  after(() =>
    logStoreActivity({
      storeId,
      actor: user,
      branchId: target.id,
      action: "stock.adjust",
      summary:
        toApply.length === 1
          ? `Set stock to ${toApply[0].stock} at ${target.name}`
          : `Adjusted stock on ${toApply.length} products at ${target.name}`,
      targetType: "branch",
      targetId: target.id,
      metadata: { branchName: target.name, count: toApply.length, updates: toApply.slice(0, 50) },
    }),
  );

  return NextResponse.json({ updated: toApply.length, branchId: target.id });
}
