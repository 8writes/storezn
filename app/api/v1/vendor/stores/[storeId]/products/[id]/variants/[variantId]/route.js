import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../../../lib/db/index.js";
import { products, productVariants, stores, branches } from "../../../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../../../lib/auth.js";
import { validate, updateVariantSchema } from "../../../../../../../../../../lib/validate.js";
import { setBranchStock } from "../../../../../../../../../../lib/inventory.js";
import { deleteVariants, VariantOrderedError } from "../../../../../../../../../../lib/variants.js";
import { logStoreActivity } from "@/lib/storeActivity.js";

async function loadOwnedVariant(user, storeId, productId, variantId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store || !canManageStore(user, store)) return null;
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId))).limit(1);
  if (!product) return null;
  const [variant] = await db.select().from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId))).limit(1);
  return variant || null;
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id, variantId } = await params;
  const variant = await loadOwnedVariant(user, storeId, id, variantId);
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(updateVariantSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Same aggregate-vs-source-of-truth reasoning as the product PATCH
  // route - a plain "Stock" field always means the default branch.
  const { stock, ...rest } = result.data;
  const [updated] = await db.update(productVariants).set(rest).where(eq(productVariants.id, variantId)).returning();

  if (stock !== undefined) {
    const [defaultBranch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.storeId, storeId), eq(branches.isDefault, true))).limit(1);
    if (defaultBranch) {
      await db.transaction((tx) => setBranchStock(tx, { productId: id, variantId, branchId: defaultBranch.id, stock }));
      const [refreshed] = await db.select({ stock: productVariants.stock }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
      updated.stock = refreshed.stock;
    }
  }

  const changedFields = Object.keys(result.data).filter((key) => JSON.stringify(result.data[key] ?? null) !== JSON.stringify(variant[key] ?? null));
  if (changedFields.length) after(() => logStoreActivity({
    storeId, actor: user, action: "product.variant.update", targetType: "product", targetId: id,
    summary: `Updated variant ${Object.values(variant.options || {}).join(" / ") || variant.id}: ${changedFields.join(", ")}`,
    metadata: { variantId, changedFields,
      before: Object.fromEntries(changedFields.map((key) => [key, variant[key] ?? null])),
      after: Object.fromEntries(changedFields.map((key) => [key, result.data[key] ?? null])) },
  }));
  return NextResponse.json({ variant: updated });
}

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id, variantId } = await params;
  const variant = await loadOwnedVariant(user, storeId, id, variantId);
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  try {
    await deleteVariants([variantId]);
  } catch (err) {
    if (err instanceof VariantOrderedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  after(() => logStoreActivity({
    storeId, actor: user, action: "product.variant.delete", targetType: "product", targetId: id,
    summary: `Deleted variant ${Object.values(variant.options || {}).join(" / ") || variant.id}`,
    metadata: { variantId, options: variant.options },
  }));
  return NextResponse.json({ success: true });
}
