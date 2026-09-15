import { db } from "./db/index.js";
import { checkoutAttempts, orders, orderItems, carts, cartItems } from "./db/schema.js";
import { and, eq } from "drizzle-orm";
import { restockItems } from "./inventory.js";

function attemptItems(attempt) {
  return Array.isArray(attempt.items) ? attempt.items : [];
}

export async function findCheckoutAttemptByReference(reference) {
  if (!reference) return null;
  const [attempt] = await db
    .select()
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.paymentReference, reference))
    .limit(1);
  return attempt || null;
}

export async function findCheckoutAttemptByOrderNumber(storeId, orderNumber) {
  const [attempt] = await db
    .select()
    .from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.storeId, storeId), eq(checkoutAttempts.orderNumber, orderNumber)))
    .limit(1);
  return attempt || null;
}

export async function failCheckoutAttemptAndReleaseStock(attempt) {
  if (!attempt || attempt.paymentStatus !== "pending") return false;

  const items = attemptItems(attempt);
  await db.transaction(async (tx) => {
    const failed = await tx
      .update(checkoutAttempts)
      .set({
        paymentStatus: "failed",
        paymentAuthorizationUrl: null,
        paymentAuthorizationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(checkoutAttempts.id, attempt.id), eq(checkoutAttempts.paymentStatus, "pending")))
      .returning({ id: checkoutAttempts.id });
    if (failed.length === 0 || !attempt.branchId) return;

    await restockItems(
      tx,
      items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId || null,
        quantity: i.quantity,
        branchId: attempt.branchId,
      })),
    );
  });

  return true;
}

export async function finalizePaidCheckoutAttempt({ attempt, paymentReference, paidAt = new Date() }) {
  if (!attempt) return null;

  if (attempt.orderId) {
    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, attempt.orderId)).limit(1);
    const existingItems = existingOrder
      ? await db.select().from(orderItems).where(eq(orderItems.orderId, existingOrder.id))
      : [];
    return { order: existingOrder || null, items: existingItems, created: false };
  }

  const snapshotItems = attemptItems(attempt);
  let createdOrder = null;
  let createdItems = [];

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(checkoutAttempts)
      .set({
        paymentStatus: "paid",
        paymentReference,
        paidAt,
        updatedAt: new Date(),
      })
      .where(and(eq(checkoutAttempts.id, attempt.id), eq(checkoutAttempts.paymentStatus, "pending")))
      .returning();

    if (claimed.length === 0) {
      const [latest] = await tx.select().from(checkoutAttempts).where(eq(checkoutAttempts.id, attempt.id)).limit(1);
      if (latest?.orderId) {
        [createdOrder] = await tx.select().from(orders).where(eq(orders.id, latest.orderId)).limit(1);
        createdItems = createdOrder ? await tx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id)) : [];
      }
      return;
    }

    const [order] = await tx
      .insert(orders)
      .values({
        storeId: attempt.storeId,
        branchId: attempt.branchId,
        userId: attempt.userId,
        cartId: attempt.cartId,
        orderNumber: attempt.orderNumber,
        guestEmail: attempt.guestEmail,
        subtotal: attempt.subtotal,
        shippingFee: attempt.shippingFee,
        shippingFeeTBD: attempt.shippingFeeTBD,
        totalAmount: attempt.totalAmount,
        commissionRatePercent: attempt.commissionRatePercent,
        commissionAmount: attempt.commissionAmount,
        flatFeeAmount: attempt.flatFeeAmount,
        vendorPayoutAmount: attempt.vendorPayoutAmount,
        feeChargedToCustomer: attempt.feeChargedToCustomer,
        shippingAddress: attempt.shippingAddress,
        note: attempt.note,
        paymentReference,
        paymentStatus: "paid",
        status: "processing",
        paidAt,
      })
      .returning();

    if (snapshotItems.length > 0) {
      createdItems = await tx
        .insert(orderItems)
        .values(
          snapshotItems.map((i) => ({
            orderId: order.id,
            productId: i.productId,
            variantId: i.variantId || null,
            productName: i.productName,
            productImage: i.productImage || null,
            variantLabel: i.variantLabel || null,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
          })),
        )
        .returning();
    }

    await tx
      .update(checkoutAttempts)
      .set({ orderId: order.id, updatedAt: new Date() })
      .where(eq(checkoutAttempts.id, attempt.id));

    if (attempt.cartId) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, attempt.cartId));
      await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, attempt.cartId));
    }

    createdOrder = order;
  });

  return { order: createdOrder, items: createdItems, created: !!createdOrder };
}
