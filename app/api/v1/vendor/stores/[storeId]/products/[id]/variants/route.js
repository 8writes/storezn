import { NextResponse } from "next/server";
import { db } from "../../../../../../../../../lib/db/index.js";
import { products, productVariants, stores, branches } from "../../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../../lib/auth.js";
import { validate, createVariantSchema } from "../../../../../../../../../lib/validate.js";
import { seedBranchStockForNewItem } from "../../../../../../../../../lib/inventory.js";

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

  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(productVariants.createdAt);
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

  const created = await db.transaction(async (tx) => {
    const [variant] = await tx.insert(productVariants).values({ productId: id, ...result.data }).returning();
    const [defaultBranch] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.storeId, storeId), eq(branches.isDefault, true))).limit(1);
    if (defaultBranch) {
      await seedBranchStockForNewItem(tx, { storeId, productId: id, variantId: variant.id, initialBranchId: defaultBranch.id, initialStock: result.data.stock ?? null });
    }
    return variant;
  });
  return NextResponse.json({ variant: created }, { status: 201 });
}
