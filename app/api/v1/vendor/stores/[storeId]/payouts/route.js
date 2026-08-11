import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Every paid order's vendorPayoutAmount is split straight to the vendor's
// own Paystack sub-account at checkout time (see DOCUMENTATION.md - the
// platform never holds vendor money) and settles to their bank on
// Paystack's standard T+1 schedule (see lib/settlement.js), except
// isOffline orders, which never touched Paystack at all (the vendor
// collected that money in person, same day). So there's no withdrawable
// "balance" here the way there would be on a platform that pools funds -
// this is a read-only ledger of money that's already moving, split out by
// channel so a vendor can tell "Paystack owes/sent me this" from "I
// already had this in hand".
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const channel = searchParams.get("channel"); // "online" | "offline" | null (all)
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [eq(orders.storeId, storeId), eq(orders.paymentStatus, "paid")];
  if (channel === "online") conditions.push(eq(orders.isOffline, false));
  if (channel === "offline") conditions.push(eq(orders.isOffline, true));

  const [[stats], [{ total }], rows] = await Promise.all([
    db
      .select({
        lifetimeTotal: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number),
        onlineTotal: sql`coalesce(sum(${orders.vendorPayoutAmount}) filter (where not ${orders.isOffline}), 0)`.mapWith(Number),
        offlineTotal: sql`coalesce(sum(${orders.vendorPayoutAmount}) filter (where ${orders.isOffline}), 0)`.mapWith(Number),
        thisMonthTotal: sql`coalesce(sum(${orders.vendorPayoutAmount}) filter (where ${orders.paidAt} >= date_trunc('month', now())), 0)`.mapWith(Number),
        ordersCount: sql`count(*)`.mapWith(Number),
        pendingSettlementCount: sql`count(*) filter (where not ${orders.isOffline} and ${orders.settledAt} is null)`.mapWith(Number),
        lastPayoutAt: sql`max(${orders.paidAt})`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.paymentStatus, "paid"))),
    db.select({ total: count() }).from(orders).where(and(...conditions)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        subtotal: orders.subtotal,
        shippingFee: orders.shippingFee,
        totalAmount: orders.totalAmount,
        commissionRatePercent: orders.commissionRatePercent,
        commissionAmount: orders.commissionAmount,
        vendorPayoutAmount: orders.vendorPayoutAmount,
        isOffline: orders.isOffline,
        status: orders.status,
        settledAt: orders.settledAt,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.paidAt))
      .limit(limit)
      .offset(offset),
  ]);

  return NextResponse.json({
    payoutAccount: store.subAccountCode
      ? { bankName: store.bankName, accountNumber: store.accountNumber, accountName: store.accountName }
      : null,
    stats,
    transactions: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
