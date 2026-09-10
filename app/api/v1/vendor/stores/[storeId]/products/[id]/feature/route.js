import { NextResponse } from "next/server";
import { db } from "../../../../../../../../../lib/db/index.js";
import { products, stores } from "../../../../../../../../../lib/db/schema.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../../lib/auth.js";

const MAX_FEATURED = 10;

async function loadOwnedProduct(user, storeId, productId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store || !canManageStore(user, store)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
    .limit(1);
  return product || null;
}

// Toggle a product on/off the storefront's "Featured" rail. Capped at
// MAX_FEATURED per store here (the column itself is unconstrained). New
// picks go to the end of the rail; removing one just clears its position
// (the remaining gaps don't matter, the rail query only orders by it).
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const product = await loadOwnedProduct(user, storeId, id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const featured = !!body?.featured;

  const [{ n: currentCount }] = await db
    .select({ n: sql`count(*)`.mapWith(Number) })
    .from(products)
    .where(and(eq(products.storeId, storeId), isNotNull(products.featuredOrder)));

  if (featured) {
    if (product.featuredOrder == null && currentCount >= MAX_FEATURED) {
      return NextResponse.json(
        { error: `You can feature up to ${MAX_FEATURED} products. Remove one first.` },
        { status: 409 },
      );
    }
    if (product.featuredOrder == null) {
      const [{ max }] = await db
        .select({ max: sql`coalesce(max(${products.featuredOrder}), -1)`.mapWith(Number) })
        .from(products)
        .where(eq(products.storeId, storeId));
      await db.update(products).set({ featuredOrder: max + 1 }).where(eq(products.id, id));
    }
  } else {
    await db.update(products).set({ featuredOrder: null }).where(eq(products.id, id));
  }

  const [{ n: featuredCount }] = await db
    .select({ n: sql`count(*)`.mapWith(Number) })
    .from(products)
    .where(and(eq(products.storeId, storeId), isNotNull(products.featuredOrder)));

  return NextResponse.json({ featured, featuredCount, maxFeatured: MAX_FEATURED });
}
