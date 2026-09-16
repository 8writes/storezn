import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../../lib/db/index.js";
import { products, productVariants, stores, branches, productBranchStock } from "../../../../../../../../../lib/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../../lib/auth.js";
import { setBranchStock } from "../../../../../../../../../lib/inventory.js";
import { logStoreActivity } from "../../../../../../../../../lib/storeActivity.js";

async function loadOwnedProduct(user, storeId, productId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store || !canManageStore(user, store)) return null;
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId))).limit(1);
  return product || null;
}

// Only meaningful once a store has more than one branch - the product/
// variant edit forms keep today's single "Stock" field otherwise (see
// the PATCH .../products/[id] and .../variants/[variantId] routes,
// which route that field straight to the default branch).
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  let [storeBranches, productRows, variants] = await Promise.all([
    db.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt),
    db.select().from(productBranchStock).where(and(eq(productBranchStock.productId, id), isNull(productBranchStock.variantId))),
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
  ]);
  const totalBranches = storeBranches.length;

  // A branch-scoped staff member only sees/edits their own branch's
  // number here - the vendor/owner (or unscoped staff) sees every branch.
  // totalBranches (above) stays the real store-wide count regardless, so
  // the UI still knows to show this panel even when it's filtered down
  // to just their one row.
  if (user.role === "staff" && user.branchId) {
    storeBranches = storeBranches.filter((b) => b.id === user.branchId);
  }

  let variantRows = [];
  if (variants.length > 0) {
    variantRows = await db.select().from(productBranchStock).where(eq(productBranchStock.productId, id));
  }

  const variantStock = {};
  for (const v of variants) {
    variantStock[v.id] = storeBranches.map((b) => {
      const row = variantRows.find((r) => r.variantId === v.id && r.branchId === b.id);
      return { branchId: b.id, branchName: b.name, stock: row ? row.stock : null };
    });
  }

  const productStock = storeBranches.map((b) => {
    const row = productRows.find((r) => r.branchId === b.id);
    return { branchId: b.id, branchName: b.name, stock: row ? row.stock : null };
  });

  return NextResponse.json({ branches: storeBranches, totalBranches, productStock, variantStock });
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { branchId, variantId, stock } = body;
  if (!branchId || (stock !== null && (typeof stock !== "number" || stock < 0))) {
    return NextResponse.json({ error: "Invalid branch or stock value" }, { status: 400 });
  }

  if (user.role === "staff" && user.branchId && branchId !== user.branchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [branch] = await db.select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.id, branchId), eq(branches.storeId, storeId))).limit(1);
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  if (variantId) {
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, id))).limit(1);
    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const [before] = await db.select({ stock: productBranchStock.stock }).from(productBranchStock)
    .where(and(eq(productBranchStock.productId, id), eq(productBranchStock.branchId, branchId),
      variantId ? eq(productBranchStock.variantId, variantId) : isNull(productBranchStock.variantId))).limit(1);
  await db.transaction((tx) => setBranchStock(tx, { productId: id, variantId: variantId || null, branchId, stock }));
  after(() => logStoreActivity({
    storeId, actor: user, branchId, action: "stock.adjust", targetType: "product", targetId: id,
    summary: `${product.name}: ${branch.name} stock ${before?.stock ?? "unlimited"} -> ${stock ?? "unlimited"}`,
    metadata: { productName: product.name, branchName: branch.name, variantId: variantId || null,
      before: before?.stock ?? null, after: stock },
  }));

  return NextResponse.json({ ok: true });
}
