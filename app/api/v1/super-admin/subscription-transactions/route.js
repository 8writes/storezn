import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { storeSubscriptionTransactions, stores } from "../../../../../lib/db/schema.js";
import { desc, eq, count } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every Storezn+ charge platform-wide (initial subscribe + every
// Paystack-initiated renewal, see recordSubscriptionTransaction in the
// Paystack webhook) - the subscription-side counterpart to
// /api/v1/super-admin/transactions, which only ever covers order
// payments.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin", "p_staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ transaction: storeSubscriptionTransactions, storeName: stores.name })
      .from(storeSubscriptionTransactions)
      .innerJoin(stores, eq(storeSubscriptionTransactions.storeId, stores.id))
      .orderBy(desc(storeSubscriptionTransactions.paidAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(storeSubscriptionTransactions),
  ]);

  return NextResponse.json({
    transactions: rows.map((r) => ({
      id: r.transaction.id,
      storeName: r.storeName,
      amount: r.transaction.amount,
      paystackReference: r.transaction.paystackReference,
      paidAt: r.transaction.paidAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
