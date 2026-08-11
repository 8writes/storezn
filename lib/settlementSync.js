import { db } from "./db/index.js";
import { orders } from "./db/schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { listSettlements, getSettlementTransactions } from "./paystack.js";

// Paystack doesn't send a settlement webhook this app can route through
// the shared account-wide webhook (website-ozmictech/lib/paystack.js
// forwards by "STOREZN-" reference prefix) - a settlement batches
// transactions across every product on the shared Paystack account by
// sub-account, not by our reference prefix, so there's nothing to route
// on. Polled instead (see app/api/cron/settlement-poll/route.js and the
// vendor's own "Check settlements" button): list this store's
// sub-account's recent settlements, and for each one that succeeded, mark
// every matching paid order (by paymentReference) as settled.
export async function syncStoreSettlements(store) {
  if (!store.subAccountCode) return 0;

  // 14 days comfortably covers Paystack's T+1 schedule plus any
  // weekend/holiday slippage - settlements older than that are already
  // reflected (settledAt only gets set once, see the isNull below).
  const from = new Date();
  from.setDate(from.getDate() - 14);

  const settlements = await listSettlements({ subaccount: store.subAccountCode, from: from.toISOString().slice(0, 10) });
  const successful = settlements.filter((s) => s.status === "success");
  if (successful.length === 0) return 0;

  let updated = 0;
  for (const settlement of successful) {
    const transactions = await getSettlementTransactions(settlement.id);
    const references = transactions.map((t) => t.reference).filter(Boolean);
    if (references.length === 0) continue;

    const result = await db
      .update(orders)
      .set({ settledAt: new Date(settlement.settlement_date || settlement.updatedAt || Date.now()) })
      .where(and(eq(orders.storeId, store.id), inArray(orders.paymentReference, references), isNull(orders.settledAt)))
      .returning({ id: orders.id });
    updated += result.length;
  }
  return updated;
}
