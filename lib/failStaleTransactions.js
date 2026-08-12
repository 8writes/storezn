import { db } from "./db/index.js";
import { orders } from "./db/schema.js";
import { and, eq, lt } from "drizzle-orm";

const STALE_AFTER_MS = 60 * 60_000;

// Shared by the manual "Fail stale pending" button
// (app/api/v1/super-admin/transactions/fail-stale) and the matching cron
// (app/api/cron/fail-stale-transactions) - a pending order past this age
// almost certainly means the buyer abandoned checkout or the webhook
// never arrived, see checkout/route.js's comment on why a pending order
// with a failed Paystack init is never auto-cleaned up on its own.
export async function failStaleTransactions() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const result = await db
    .update(orders)
    .set({ paymentStatus: "failed" })
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });

  return { failed: result.length };
}
