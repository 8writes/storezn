import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { orders, orderItems, refundRequests, orderTenders, stores } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, updateOrderStatusSchema } from "../../../../../../../../lib/validate.js";
import { restockItems } from "../../../../../../../../lib/inventory.js";

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
  // A branch-scoped staff member (see users.branchId) only manages
  // orders fulfilled from their own branch - a vendor/owner (branchId
  // always null) still sees every branch's orders.
  if (user.role === "staff" && user.branchId && order.branchId !== user.branchId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const [refundRequest] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);
  // Split-tender breakdown for a register sale (see the pos/sales route);
  // empty for every online/manual order. try/caught so this route keeps
  // working if it ships ahead of the POS migration (missing table).
  let tenders = [];
  try {
    tenders = await db.select().from(orderTenders).where(eq(orderTenders.orderId, id)).orderBy(orderTenders.createdAt);
  } catch {
    tenders = [];
  }

  return NextResponse.json({ order, items, tenders, refundRequest: refundRequest || null });
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
  if (user.role === "staff" && user.branchId && order.branchId !== user.branchId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

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
    const decided = await db.transaction(async (tx) => {
      // Guarded on status = 'pending' so two racing decisions (e.g. a
      // double-clicked "Approve") can't both pass the check above and
      // both restock the same items.
      const [claimed] = await tx
        .update(refundRequests)
        .set({ status: refundDecision, reviewedBy: user.id, reviewNote: reviewNote || null, reviewedAt: new Date() })
        .where(and(eq(refundRequests.id, refundRequest.id), eq(refundRequests.status, "pending")))
        .returning({ id: refundRequests.id });
      if (!claimed) return false;
      await tx
        .update(orders)
        .set({ status: refundDecision === "approved" ? "refunded" : "refund_declined", updatedAt: new Date() })
        .where(eq(orders.id, id));
      if (refundDecision === "approved") {
        const refundedItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        await restockItems(tx, refundedItems.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, branchId: order.branchId })));
      }
      return true;
    });
    if (!decided) return NextResponse.json({ error: "This refund request was already reviewed" }, { status: 409 });
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
    const updated = await db.transaction(async (tx) => {
      // Guarded on the status we validated the transition against - two
      // racing PATCHes (e.g. "cancel" and "mark shipped" fired together)
      // must not both apply, or a cancelled order could ship AND have its
      // stock returned for resale.
      const [row] = await tx
        .update(orders)
        .set(data)
        .where(and(eq(orders.id, id), eq(orders.status, order.status)))
        .returning();
      if (!row) return null;
      if (status === "cancelled") {
        const cancelledItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        await restockItems(tx, cancelledItems.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, branchId: order.branchId })));
      }
      return row;
    });
    if (!updated) return NextResponse.json({ error: "This order's status changed - reload and try again" }, { status: 409 });
    return NextResponse.json({ order: updated });
  }

  if (shippingFee != null && shippingFeeUnconfirmed) {
    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return NextResponse.json({ order: updated });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
