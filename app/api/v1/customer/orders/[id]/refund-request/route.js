import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, refundRequests, stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../../../lib/auth.js";
import { validate, requestRefundSchema } from "../../../../../../../lib/validate.js";

export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order || order.userId !== user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "delivered") {
    return NextResponse.json({ error: "Refunds can only be requested after delivery" }, { status: 400 });
  }

  const [store] = await db.select({ returnWindowDays: stores.returnWindowDays }).from(stores).where(eq(stores.id, order.storeId)).limit(1);
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const windowMs = (store?.returnWindowDays ?? 7) * 24 * 60 * 60 * 1000;
  if (deliveredAt && Date.now() - deliveredAt.getTime() > windowMs) {
    return NextResponse.json(
      { error: `The ${store?.returnWindowDays ?? 7}-day refund window for this order has passed` },
      { status: 400 },
    );
  }

  const [existing] = await db.select({ id: refundRequests.id }).from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);
  if (existing) return NextResponse.json({ error: "A refund request already exists for this order" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(requestRefundSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [created] = await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(refundRequests)
      .values({ orderId: id, requestedBy: user.id, reason: result.data.reason })
      .returning();
    await tx.update(orders).set({ status: "refund_requested", updatedAt: new Date() }).where(eq(orders.id, id));
    return [request];
  });

  return NextResponse.json({ refundRequest: created }, { status: 201 });
}
