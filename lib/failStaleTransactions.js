import { db } from "./db/index.js";
import { checkoutAttempts, orders, orderItems } from "./db/schema.js";
import { and, eq, inArray, lt } from "drizzle-orm";
import { restockItems } from "./inventory.js";

const STALE_AFTER_MS = 60 * 60_000;
const CLEANUP_BATCH_SIZE = 500;

// Shared by the manual "Fail stale pending" button
// (app/api/v1/super-admin/transactions/fail-stale) and the matching cron
// (app/api/cron/fail-stale-transactions) - a pending order past this age
// almost certainly means the buyer abandoned checkout or the webhook
// never arrived, see checkout/route.js's comment on why a pending order
// with a failed Paystack init is never auto-cleaned up on its own.
//
// Checkout reserves stock at order-creation time (see reserveStock in
// lib/inventory.js), so a pending order that never gets paid is holding
// a live reservation - this is what releases it back.
export async function failStaleTransactions() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const staleAttempts = await db
    .select()
    .from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.paymentStatus, "pending"), lt(checkoutAttempts.createdAt, cutoff)))
    .limit(CLEANUP_BATCH_SIZE);

  let failedAttempts = 0;
  for (const attempt of staleAttempts) {
    const items = Array.isArray(attempt.items) ? attempt.items : [];
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
      if (failed.length === 0) return;
      failedAttempts += 1;
      if (!attempt.branchId) return;

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
  }

  const stale = await db
    .select({ id: orders.id, branchId: orders.branchId })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)))
    .limit(CLEANUP_BATCH_SIZE);
  if (stale.length === 0) return { failed: failedAttempts };

  const staleIds = stale.map((o) => o.id);
  let failedCount = 0;
  await db.transaction(async (tx) => {
    // The status flip is the atomic claim: a buyer who completes payment
    // in the gap between the SELECT above and this transaction has their
    // webhook flip the order to "paid" first, and the `= 'pending'` guard
    // here then skips it - without that guard this UPDATE would clobber a
    // genuinely-paid order back to "abandoned" and its stock would be
    // released for resale even though the money already split to the
    // vendor. Only the rows this UPDATE actually claims get restocked.
    //
    // Marking "failed" (not left "pending") also frees each order's
    // uq_orders_cart_pending slot (lib/db/schema.js), so an abandoned
    // cart can be checked out again right away. status moves to
    // "abandoned" so it reads as a never-completed checkout.
    const failed = await tx
      .update(orders)
      .set({ paymentStatus: "failed", status: "abandoned" })
      .where(and(inArray(orders.id, staleIds), eq(orders.paymentStatus, "pending")))
      .returning({ id: orders.id, branchId: orders.branchId });
    failedCount = failed.length;
    if (failed.length === 0) return;

    const failedIds = failed.map((o) => o.id);
    const branchByOrderId = new Map(failed.map((o) => [o.id, o.branchId]));
    const items = await tx.select().from(orderItems).where(inArray(orderItems.orderId, failedIds));
    await restockItems(
      tx,
      items
        .filter((i) => branchByOrderId.get(i.orderId))
        .map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, branchId: branchByOrderId.get(i.orderId) })),
    );
  });

  return { failed: failedAttempts + failedCount };
}
