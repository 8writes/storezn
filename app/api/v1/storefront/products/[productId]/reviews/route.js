import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { reviews, orders, orderItems, customers } from "../../../../../../../lib/db/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { getUser } from "../../../../../../../lib/auth.js";
import { validate, createReviewSchema } from "../../../../../../../lib/validate.js";
import { isOwnedUploadUrl } from "../../../../../../../lib/storage/index.js";

export async function GET(req, { params }) {
  const { productId } = await params;

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

  const [created] = await db
    .insert(reviews)
    .values({ productId, userId: user.id, orderId: purchase.orderId, ...reviewData, imageUrl: imageUrl || null })
    .returning();

  return NextResponse.json({ review: created }, { status: 201 });
}
