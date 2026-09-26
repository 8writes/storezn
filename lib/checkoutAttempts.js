import { db } from "./db/index.js";
import { checkoutAttempts, orders, orderItems, carts, cartItems } from "./db/schema.js";
import { and, eq } from "drizzle-orm";
import { OutOfStockError, reserveStock, restockItems } from "./inventory.js";

function attemptItems(attempt) {
  return Array.isArray(attempt.items) ? attempt.items : [];
}

export function canFinalizeCheckoutAttemptPaymentStatus(status, { recoverReleasedStock = false } = {}) {
  return status === "pending" || (recoverReleasedStock && status === "failed");
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

export async function finalizePaidCheckoutAttempt({ attempt, paymentReference, paidAt = new Date(), recoverReleasedStock = false }) {
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
  // Set ONLY by the branch that actually inserts the order below. The two
  // loser paths (an attempt that already had an orderId, and a status
  // claim that matched zero rows) also populate `createdOrder` - from the
  // row a concurrent caller inserted - so deriving "created" from that
  // variable reported true for both of them, and every caller uses this
  // flag to decide whether to send the order-confirmation email and the
  // vendor's "New order" push. Two concurrent webhook deliveries for one
  // charge therefore sent the buyer two confirmations.
  let didCreate = false;
  let recoveredReleasedStock = false;
  let oversold = false;

  await db.transaction(async (tx) => {
    const [lockedAttempt] = await tx
      .select()
      .from(checkoutAttempts)
      .where(eq(checkoutAttempts.id, attempt.id))
      .for("update")
      .limit(1);

    if (!lockedAttempt) return;
    if (lockedAttempt.orderId) {
      [createdOrder] = await tx.select().from(orders).where(eq(orders.id, lockedAttempt.orderId)).limit(1);
      createdItems = createdOrder ? await tx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id)) : [];
      return;
    }
    if (!canFinalizeCheckoutAttemptPaymentStatus(lockedAttempt.paymentStatus, { recoverReleasedStock })) return;

    recoveredReleasedStock = lockedAttempt.paymentStatus === "failed";
    if (recoveredReleasedStock && lockedAttempt.branchId) {
      try {
        await reserveStock(
          tx,
          snapshotItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || null,
            quantity: i.quantity,
            productName: i.productName,
            branchId: lockedAttempt.branchId,
          })),
        );
      } catch (err) {
        if (err instanceof OutOfStockError) {
          oversold = true;
        } else {
          throw err;
        }
      }
    }

    const claimed = await tx
      .update(checkoutAttempts)
      .set({
        paymentStatus: "paid",
        paymentReference,
        paidAt,
        updatedAt: new Date(),
      })
      .where(and(eq(checkoutAttempts.id, lockedAttempt.id), eq(checkoutAttempts.paymentStatus, lockedAttempt.paymentStatus)))
      .returning();

    if (claimed.length === 0) {
      const [latest] = await tx.select().from(checkoutAttempts).where(eq(checkoutAttempts.id, lockedAttempt.id)).limit(1);
      if (latest?.orderId) {
        [createdOrder] = await tx.select().from(orders).where(eq(orders.id, latest.orderId)).limit(1);
        createdItems = createdOrder ? await tx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id)) : [];
      }
      return;
    }

    didCreate = true;
    const [order] = await tx
      .insert(orders)
      .values({
        storeId: lockedAttempt.storeId,
        branchId: lockedAttempt.branchId,
        userId: lockedAttempt.userId,
        cartId: lockedAttempt.cartId,
        orderNumber: lockedAttempt.orderNumber,
        guestEmail: lockedAttempt.guestEmail,
        subtotal: lockedAttempt.subtotal,
        shippingFee: lockedAttempt.shippingFee,
        shippingFeeTBD: lockedAttempt.shippingFeeTBD,
        totalAmount: lockedAttempt.totalAmount,
        commissionRatePercent: lockedAttempt.commissionRatePercent,
        commissionAmount: lockedAttempt.commissionAmount,
        flatFeeAmount: lockedAttempt.flatFeeAmount,
        vendorPayoutAmount: lockedAttempt.vendorPayoutAmount,
        feeChargedToCustomer: lockedAttempt.feeChargedToCustomer,
        shippingAddress: lockedAttempt.shippingAddress,
        note: lockedAttempt.note,
        paymentReference,
        paymentStatus: "paid",
        amountPaid: lockedAttempt.totalAmount,
        amountDue: 0,
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
            customerFields: i.customerFields || {},
          })),
        )
        .returning();
    }

    await tx
      .update(checkoutAttempts)
      .set({ orderId: order.id, updatedAt: new Date() })
      .where(eq(checkoutAttempts.id, lockedAttempt.id));

    if (lockedAttempt.cartId) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, lockedAttempt.cartId));
      // The guest cookie is no longer an identity for a converted cart. Clear
      // it so the browser can create its next cart without hitting the carts'
      // unique guest-token constraint.
      await tx
        .update(carts)
        .set({ status: "converted", guestToken: null, updatedAt: new Date() })
        .where(eq(carts.id, lockedAttempt.cartId));
    }

    createdOrder = order;
  });

  return { order: createdOrder, items: createdItems, created: didCreate, recoveredReleasedStock, oversold };
}
