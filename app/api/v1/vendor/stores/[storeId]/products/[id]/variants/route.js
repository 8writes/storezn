import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../../lib/db/index.js";
import { products, productVariants, stores, branches } from "../../../../../../../../../lib/db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../../lib/auth.js";
import { validate, createVariantSchema } from "../../../../../../../../../lib/validate.js";
import { seedBranchStockForNewItem } from "../../../../../../../../../lib/inventory.js";
import { deleteVariants, VariantOrderedError } from "../../../../../../../../../lib/variants.js";
import { logStoreActivity } from "@/lib/storeActivity.js";
import { STAFF_BRANCH_REQUIRED_MESSAGE, stockBranchForUser } from "@/lib/stockBranch.js";

async function loadOwnedProduct(user, storeId, productId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store || !canManageStore(user, store)) return null;
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId))).limit(1);
  return product || null;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const activeOnly = new URL(req.url).searchParams.get("active") === "true";
  const conditions = [eq(productVariants.productId, id)];
  if (activeOnly) conditions.push(eq(productVariants.isActive, true));
  const variants = await db.select().from(productVariants).where(and(...conditions)).orderBy(productVariants.createdAt);
  return NextResponse.json({ variants });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(createVariantSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (product.saleMode === "invoice_required" && result.data.price != null) {
    return NextResponse.json({ error: "Invoice-required variants cannot have a fixed price" }, { status: 400 });
  }

  const storeBranches = await db.select({ id: branches.id, isDefault: branches.isDefault }).from(branches).where(eq(branches.storeId, storeId));
  const initialBranch = stockBranchForUser(storeBranches, user);
  if (user.role === "staff" && !initialBranch) {
    return NextResponse.json({ error: STAFF_BRANCH_REQUIRED_MESSAGE }, { status: 409 });
  }

  const created = await db.transaction(async (tx) => {
    const [variant] = await tx.insert(productVariants).values({ productId: id, ...result.data }).returning();
    if (initialBranch) {
      await seedBranchStockForNewItem(tx, { storeId, productId: id, variantId: variant.id, initialBranchId: initialBranch.id, initialStock: result.data.stock ?? null });
    }
    return variant;
  });
  after(() => logStoreActivity({
    storeId, actor: user, action: "product.variant.create", targetType: "product", targetId: id,
    summary: `${product.name}: added variant ${Object.values(created.options || {}).join(" / ") || created.id}`,
    metadata: { variantId: created.id, options: created.options, price: created.price, stock: created.stock },
  }));
  return NextResponse.json({ variant: created }, { status: 201 });
}

// Bulk delete - body { ids: string[] }. Only ids that actually belong to
// this product are touched; cleanup (cart lines, branch-stock) and the
// "part of an order" guard are shared with the single-variant route.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === "string") : null;
  if (!ids || ids.length === 0) return NextResponse.json({ error: "No variants selected" }, { status: 400 });

  const owned = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, id), inArray(productVariants.id, ids)));
  const ownedIds = owned.map((v) => v.id);
  if (ownedIds.length === 0) return NextResponse.json({ error: "Variants not found" }, { status: 404 });

  try {
    const deleted = await deleteVariants(ownedIds);
    after(() => logStoreActivity({
      storeId, actor: user, action: "product.variant.delete", targetType: "product", targetId: id,
      summary: `${product.name}: deleted ${deleted} variant${deleted === 1 ? "" : "s"}`,
      metadata: { variantIds: ownedIds },
    }));
    return NextResponse.json({ deleted });
  } catch (err) {
    if (err instanceof VariantOrderedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
