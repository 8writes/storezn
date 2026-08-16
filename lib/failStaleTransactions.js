import { db } from "./db/index.js";
import { orders, orderItems } from "./db/schema.js";
import { and, eq, inArray, lt } from "drizzle-orm";
import { restockItems } from "./inventory.js";

const STALE_AFTER_MS = 60 * 60_000;

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
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)));
  if (stale.length === 0) return { failed: 0 };

  const staleIds = stale.map((o) => o.id);
  await db.transaction(async (tx) => {
    const items = await tx.select().from(orderItems).where(inArray(orderItems.orderId, staleIds));
    await restockItems(tx, items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })));
    await tx.update(orders).set({ paymentStatus: "failed" }).where(inArray(orders.id, staleIds));
  });

  return { failed: staleIds.length };
}
