import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { reviews, orders, orderItems, customers, products, storeUploads } from "../../../../../../../lib/db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getUser } from "../../../../../../../lib/auth.js";
import { validate, createReviewSchema } from "../../../../../../../lib/validate.js";
import { isOwnedUploadUrl } from "../../../../../../../lib/storage/index.js";
import { resolveStoreByHost, isStoreLive, isForeignCustomer } from "../../../../../../../lib/resolveStore.js";

export async function GET(req, { params }) {
  const { productId } = await params;
  const host = req.headers.get("host");
  const store = host ? await resolveStoreByHost(host) : null;
  if (!isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (isForeignCustomer(user, store)) return NextResponse.json({ error: "Sign in to this store to continue" }, { status: 403 });

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, store.id), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      imageUrl: reviews.imageUrl,
      createdAt: reviews.createdAt,
      firstName: customers.firstName,
    })
    .from(reviews)
    .innerJoin(customers, eq(reviews.userId, customers.id))
    .where(eq(reviews.productId, productId))
    .orderBy(desc(reviews.createdAt));

  const [agg] = await db
    .select({ average: sql`coalesce(avg(${reviews.rating}), 0)`.mapWith(Number), count: sql`count(*)`.mapWith(Number) })
    .from(reviews)
    .where(eq(reviews.productId, productId));

  let eligibleOrderId = null;
  const user = await getUser(req);
  if (user) {
    const [existing] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.userId, user.id))).limit(1);
    if (!existing) {
      const [purchase] = await db
        .select({ orderId: orders.id })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orderItems.productId, productId), eq(orders.userId, user.id), eq(orders.status, "delivered")))
        .limit(1);
      eligibleOrderId = purchase?.orderId || null;
    }
  }

  return NextResponse.json({ reviews: rows, average: agg?.average || 0, count: agg?.count || 0, eligibleOrderId });
}

// Purchase-gated: the reviewer must have a delivered order containing
// this product - orderId is looked up server-side from that order, never
// trusted from the client, so there's no way to submit a review for
// something never bought.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;
  const host = req.headers.get("host");
  const store = host ? await resolveStoreByHost(host) : null;
  if (!isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, store.id), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const [existing] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.userId, user.id))).limit(1);
  if (existing) return NextResponse.json({ error: "You've already reviewed this product" }, { status: 409 });

  const [purchase] = await db
    .select({ orderId: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.productId, productId), eq(orders.userId, user.id), eq(orders.status, "delivered")))
    .limit(1);
  if (!purchase) return NextResponse.json({ error: "You can only review products you've bought and received" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(createReviewSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // An attached photo must be one this customer uploaded through
  // /api/v1/storefront/reviews/upload (keyed under review-image/<id>/) -
  // never an arbitrary URL passed straight into the review row.
  const { imageUrl, ...reviewData } = result.data;
  if (imageUrl && !isOwnedUploadUrl(imageUrl, user.id)) {
    return NextResponse.json({ error: "That image couldn't be attached" }, { status: 400 });
  }
  let claimError = false;
  const created = await db.transaction(async (tx) => {
    if (imageUrl) {
      const [claimed] = await tx
        .update(storeUploads)
        .set({ purpose: "review-image" })
        .where(
          and(
            eq(storeUploads.url, imageUrl),
            eq(storeUploads.storeId, store.id),
            eq(storeUploads.purpose, "review-image-pending"),
          ),
        )
        .returning({ id: storeUploads.id });
      if (!claimed) {
        claimError = true;
        throw new Error("That image has expired or was already attached");
      }
    }

    const [row] = await tx
      .insert(reviews)
      .values({ productId, userId: user.id, orderId: purchase.orderId, ...reviewData, imageUrl: imageUrl || null })
      .returning();
    return row;
  }).catch((err) => {
    if (claimError) return null;
    throw err;
  });
  if (!created) return NextResponse.json({ error: "That image has expired or was already attached" }, { status: 400 });

  return NextResponse.json({ review: created }, { status: 201 });
}
