import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { orders, orderItems, refundRequests, stores } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, updateOrderStatusSchema } from "../../../../../../../../lib/validate.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

const NEXT_STATUS = {
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
};

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId))).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const [refundRequest] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);

  return NextResponse.json({ order, items, refundRequest: refundRequest || null });
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId))).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(updateOrderStatusSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { status, refundDecision, reviewNote, shippingFee } = result.data;

  // Order-level shipping fee still needs recording, even if this request
  // is purely a "set the fee" call with no status change alongside it.
  const shippingFeeUnconfirmed = order.shippingFeeTBD && !order.shippingFeeConfirmedAt;
  if (shippingFee != null && shippingFeeUnconfirmed) {
    await db
      .update(orders)
      .set({ shippingFee, shippingFeeConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, id));
    order.shippingFee = shippingFee;
    order.shippingFeeConfirmedAt = new Date();
  }

  if (refundDecision) {
    const [refundRequest] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);
    if (!refundRequest || refundRequest.status !== "pending") {
      return NextResponse.json({ error: "No pending refund request for this order" }, { status: 400 });
    }
    await db.transaction(async (tx) => {
      await tx
        .update(refundRequests)
        .set({ status: refundDecision, reviewedBy: user.id, reviewNote: reviewNote || null, reviewedAt: new Date() })
        .where(eq(refundRequests.id, refundRequest.id));
      await tx
        .update(orders)
        .set({ status: refundDecision === "approved" ? "refunded" : "refund_declined", updatedAt: new Date() })
        .where(eq(orders.id, id));
    });
    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return NextResponse.json({ order: updated });
  }

  if (status) {
    const allowed = NEXT_STATUS[order.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `Cannot move an order from "${order.status}" to "${status}"` }, { status: 400 });
    }
    if (order.shippingFeeTBD && !order.shippingFeeConfirmedAt) {
      return NextResponse.json(
        { error: "Set the actual delivery fee before updating this order's status" },
        { status: 400 },
      );
    }
    const data = { status, updatedAt: new Date() };
    // Anchor for the store's return window (see stores.returnWindowDays
    // and POST /api/v1/customer/orders/[id]/refund-request) - counts from
    // when the customer actually received the item, not from payment.
    if (status === "delivered") data.deliveredAt = new Date();
    const [updated] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return NextResponse.json({ order: updated });
  }

  if (shippingFee != null && shippingFeeUnconfirmed) {
    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return NextResponse.json({ order: updated });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
