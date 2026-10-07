import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { orders, orderItems, refundRequests, stores } from "@/lib/db/schema.js";
import { getUser, isStoreOwner } from "@/lib/auth.js";
import { validate, vendorRefundSchema } from "@/lib/validate.js";
import { restockItems } from "@/lib/inventory.js";
import { logStoreActivity, actorLabel } from "@/lib/storeActivity.js";
import { formatCurrency } from "@/lib/format.js";
import { withApiMonitoring } from "@/lib/apiMonitoring.js";

// A refund the STORE starts, rather than one the buyer asked for.
//
// PATCH .../orders/[id]'s refundDecision only ever answers a customer's
// request, and that request can only exist for a logged-in customer, on a
// delivered order, inside the return window. So before this route there
// was no way at all to refund a guest order, an undelivered one, or
// anything past the window - the vendor's only option was to move money
// in the Paystack dashboard and leave Storezn's own records wrong.
//
// This records the refund; it does not move money (same as approving a
// customer request - see the confirm copy on the order page). The vendor
// still sends the funds themselves.
async function handlePost(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  // Owner-only, the same bar as the payout account and a POS return:
  // this writes off real money and is not reversible from the UI.
  if (!isStoreOwner(user, store)) {
    return NextResponse.json({ error: "Only the store owner can record a refund" }, { status: 403 });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.storeId, storeId)))
    .limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(vendorRefundSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (!["paid", "partially_paid"].includes(order.paymentStatus)) {
    return NextResponse.json({ error: "Only a paid order can be refunded" }, { status: 409 });
  }
  if (order.status === "refunded") {
    return NextResponse.json({ error: "This order has already been refunded" }, { status: 409 });
  }
  // A pending customer request is answered through PATCH .../orders/[id]
  // (approve/reject), so that the buyer's own request is the thing being
  // resolved rather than a second, parallel record appearing beside it.
  const [existing] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);
  if (existing) {
    return NextResponse.json(
      {
        error: existing.status === "pending"
          ? "This order already has a refund request - approve or reject that instead"
          : "A refund has already been recorded for this order",
      },
      { status: 409 },
    );
  }

  // Refundable against what was actually collected, not the order total -
  // a part-paid invoice order must not be refundable for more than the
  // buyer has handed over.
  const collected = Number(order.amountPaid ?? order.totalAmount) || 0;
  const amount = result.data.amount ?? collected;
  if (amount > collected + 0.5) {
    return NextResponse.json(
      { error: `This order has only been paid ${formatCurrency(collected)}` },
      { status: 400 },
    );
  }
  const isFull = amount >= collected - 0.5;
  const restock = result.data.restock !== false;

  let items = [];
  try {
    const recorded = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(refundRequests)
        .values({
          orderId: id,
          requestedBy: null,
          initiatedBy: user.id,
          initiatedByName: actorLabel(user),
          reason: result.data.reason,
          amount,
          status: "approved",
          reviewedBy: user.id,
          reviewedAt: new Date(),
        })
        .returning();

      // A partial refund leaves the order's own status alone: it is still
      // the sale it mostly was, and flipping it to "refunded" would drop
      // the whole order out of revenue (see the status filters in the
      // analytics route) over a part refund.
      if (isFull) {
        await tx.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(eq(orders.id, id));
      } else {
        await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, id));
      }

      if (restock && order.branchId) {
        items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        await restockItems(
          tx,
          items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            branchId: order.branchId,
          })),
        );
      }
      return row;
    });

    after(() =>
      logStoreActivity({
        storeId,
        actor: user,
        branchId: order.branchId,
        action: "order.refund",
        summary:
          `Refunded ${formatCurrency(amount)}${isFull ? "" : ` of ${formatCurrency(collected)}`} on ${order.orderNumber}` +
          (restock && order.branchId ? " and returned the items to stock" : " without restocking"),
        targetType: "order",
        targetId: id,
        metadata: {
          orderNumber: order.orderNumber,
          amount,
          collected,
          isFull,
          restocked: restock && !!order.branchId,
          reason: result.data.reason,
        },
      }),
    );

    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return NextResponse.json({ order: updated, refund: recorded }, { status: 201 });
  } catch (err) {
    // uq_refund_requests_order_id - a second submit raced the first.
    if (err?.code === "23505") {
      return NextResponse.json({ error: "A refund has already been recorded for this order" }, { status: 409 });
    }
    throw err;
  }
}

export const POST = withApiMonitoring(handlePost, { source: "vendor.order.refund" });
