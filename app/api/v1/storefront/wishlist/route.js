import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { products, productVariants, wishlistItems } from "@/lib/db/schema.js";
import { getUser } from "@/lib/auth.js";
import { resolveStoreByHost, isStoreLive, isForeignCustomer } from "@/lib/resolveStore.js";
import { stripInternalProductFields } from "@/lib/pricing.js";
import { checkRateLimit } from "@/lib/rateLimit.js";
import { isUniqueViolation } from "@/lib/dbErrors.js";
import { withApiMonitoring } from "@/lib/apiMonitoring.js";

// A logged-in customer's saved products for this store.
//
// Customers are store-scoped (see customers.storeId), so a wishlist never
// spans stores and the store is always resolved from the host rather than
// trusted from the client.

async function requireShopper(req) {
  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store || !isStoreLive(store)) return { error: "Store not found", status: 404 };

  const user = await getUser(req);
  if (!user || user.role !== "customer") return { error: "Sign in to use your wishlist", status: 401 };
  // A customer of another store presenting their token here must not be
  // able to read or write a list against this one.
  if (isForeignCustomer(user, store)) return { error: "Sign in to this store to continue", status: 403 };

  return { store, user };
}

async function handleGet(req) {
  const ctx = await requireShopper(req);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const rows = await db
    .select({ item: wishlistItems, product: products })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .where(and(eq(wishlistItems.customerId, ctx.user.id), eq(wishlistItems.storeId, ctx.store.id)))
    .orderBy(desc(wishlistItems.createdAt));

  // A saved product can be archived or suspended after it was saved. It
  // stays on the list - quietly dropping something the shopper chose is
  // worse than showing it as unavailable - but it is marked so the card
  // can say so instead of offering a dead "add to cart".
  const available = rows.filter((row) => row.product.isActive && !row.product.suspendedAt).map((row) => row.product.id);
  const variantRows = available.length
    ? await db
      .select({ productId: productVariants.productId, stock: productVariants.stock })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, available), eq(productVariants.isActive, true)))
    : [];
  const variantStock = new Map();
  for (const row of variantRows) {
    variantStock.set(row.productId, (variantStock.get(row.productId) || 0) + (row.stock ?? Infinity));
  }

  return NextResponse.json({
    items: rows.map((row) => {
      const unavailable = !row.product.isActive || !!row.product.suspendedAt;
      const stock = variantStock.has(row.product.id) ? variantStock.get(row.product.id) : row.product.stock;
      return {
        id: row.item.id,
        savedAt: row.item.createdAt,
        unavailable,
        outOfStock: row.product.productType === "physical" && stock != null && stock <= 0,
        product: stripInternalProductFields(row.product),
      };
    }),
  });
}

async function handlePost(req) {
  const limit = await checkRateLimit(req, "wishlist-write", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many changes, try again shortly" }, { status: 429 });

  const ctx = await requireShopper(req);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  if (!productId) return NextResponse.json({ error: "Which product?" }, { status: 400 });

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(
      eq(products.id, productId),
      eq(products.storeId, ctx.store.id),
      eq(products.isActive, true),
      isNull(products.suspendedAt),
    ))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  try {
    const [saved] = await db
      .insert(wishlistItems)
      .values({ storeId: ctx.store.id, customerId: ctx.user.id, productId })
      .returning();
    return NextResponse.json({ item: saved, saved: true }, { status: 201 });
  } catch (err) {
    // Already on the list - tapping the heart twice saves one item, and
    // the second tap is a success from the shopper's point of view.
    if (isUniqueViolation(err)) return NextResponse.json({ saved: true, alreadySaved: true });
    throw err;
  }
}

async function handleDelete(req) {
  const limit = await checkRateLimit(req, "wishlist-write", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many changes, try again shortly" }, { status: 429 });

  const ctx = await requireShopper(req);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const productId = new URL(req.url).searchParams.get("productId")?.trim();
  if (!productId) return NextResponse.json({ error: "Which product?" }, { status: 400 });

  await db
    .delete(wishlistItems)
    .where(and(
      eq(wishlistItems.customerId, ctx.user.id),
      eq(wishlistItems.storeId, ctx.store.id),
      eq(wishlistItems.productId, productId),
    ));

  // Deliberately not a 404 when it wasn't there: removing something twice
  // is the outcome the shopper wanted either way.
  return NextResponse.json({ saved: false });
}

export const GET = withApiMonitoring(handleGet, { source: "storefront.wishlist.list" });
export const POST = withApiMonitoring(handlePost, { source: "storefront.wishlist.add" });
export const DELETE = withApiMonitoring(handleDelete, { source: "storefront.wishlist.remove" });
