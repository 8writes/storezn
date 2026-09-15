import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { orders, orderItems } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../../lib/auth.js";
import { resolveStoreByHost } from "../../../../../../lib/resolveStore.js";
import { verifyTransaction } from "../../../../../../lib/paystack.js";
import { restockItems } from "../../../../../../lib/inventory.js";

function paymentReferenceMatches(order, reference) {
  if (!reference) return false;
  return reference === order.paymentReference || reference.match(/^STOREZN-(ORD-[0-9A-Z]+)(?:-[0-9A-Z]+)?$/)?.[1] === order.orderNumber;
}

async function failAbandonedPayment(order) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  await db.transaction(async (tx) => {
    const failed = await tx
      .update(orders)
      .set({
        paymentStatus: "failed",
        status: "abandoned",
        paymentAuthorizationUrl: null,
        paymentAuthorizationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending")))
      .returning({ id: orders.id });
    if (failed.length === 0 || !order.branchId) return;

    await restockItems(
      tx,
      items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, branchId: order.branchId })),
    );
  });
}

async function syncPendingPaymentStatus(order, reference) {
  if (order.paymentStatus !== "pending" || !paymentReferenceMatches(order, reference)) return order;

  const transaction = await verifyTransaction(reference);
  if (transaction.paymentStatus !== "FAILED") return order;

  await failAbandonedPayment(order);
  return {
    ...order,
    paymentStatus: "failed",
    status: "abandoned",
    paymentAuthorizationUrl: null,
    paymentAuthorizationExpiresAt: null,
    updatedAt: new Date(),
  };
}

// Guests prove ownership with the order number + the email they checked
// out with; logged-in customers just need to own the order.
export async function GET(req, { params }) {
  const { orderNumber } = await params;
  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.storeId, store.id)))
    .limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const searchParams = new URL(req.url).searchParams;
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const user = await getUser(req);
  if (order.userId) {
    if (!user || user.id !== order.userId) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  } else {
    const email = searchParams.get("email")?.toLowerCase();
    if ((!email || email !== order.guestEmail?.toLowerCase()) && !paymentReferenceMatches(order, reference)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  }

  const syncedOrder = await syncPendingPaymentStatus(order, reference);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return NextResponse.json({ order: syncedOrder, items });
}
