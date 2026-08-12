import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders, stores } from "../../../../../lib/db/schema.js";
import { and, desc, eq, count, ilike } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every checkout attempt, regardless of paymentStatus - unlike
// /api/v1/super-admin/orders (which hard-filters to paid only, since
// it's meant for order fulfillment), this exists specifically so a
// pending/failed payment attempt is never invisible: an order row is
// created (see app/api/v1/storefront/checkout/route.js) before the
// customer ever reaches Paystack, but nothing today re-checks a pending
// row if the webhook never arrives - see paymentReference, which is the
// same reference to look up directly in the Paystack dashboard.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const paymentStatus = searchParams.get("paymentStatus");
  const storeId = searchParams.get("storeId");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [];
  if (paymentStatus) conditions.push(eq(orders.paymentStatus, paymentStatus));
  if (storeId) conditions.push(eq(orders.storeId, storeId));
  if (q) conditions.push(ilike(orders.orderNumber, `%${q}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }], [{ pendingCount }], [{ failedCount }]] = await Promise.all([
    db
      .select({ order: orders, storeName: stores.name })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(where),
    db.select({ pendingCount: count() }).from(orders).where(eq(orders.paymentStatus, "pending")),
    db.select({ failedCount: count() }).from(orders).where(eq(orders.paymentStatus, "failed")),
  ]);

  return NextResponse.json({
    transactions: rows.map((r) => ({
      id: r.order.id,
      orderNumber: r.order.orderNumber,
      storeName: r.storeName,
      createdAt: r.order.createdAt,
      paidAt: r.order.paidAt,
      totalAmount: r.order.totalAmount,
      commissionAmount: r.order.commissionAmount,
      paymentStatus: r.order.paymentStatus,
      paymentReference: r.order.paymentReference,
      isOffline: r.order.isOffline,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: { pendingCount, failedCount },
  });
}
