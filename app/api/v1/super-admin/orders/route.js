import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders, stores } from "../../../../../lib/db/schema.js";
import { and, desc, eq, count, ilike } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Platform-wide order visibility - the "admin approval workflow" and
// dispute-oversight capability from the PRD: a super_admin can see every
// order across every store, not just the vendor's own.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const status = searchParams.get("status");
  const storeId = searchParams.get("storeId");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [eq(orders.paymentStatus, "paid")];
  if (status) conditions.push(eq(orders.status, status));
  if (storeId) conditions.push(eq(orders.storeId, storeId));
  if (q) conditions.push(ilike(orders.orderNumber, `%${q}%`));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ order: orders, storeName: stores.name })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(and(...conditions)),
  ]);

  return NextResponse.json({
    orders: rows.map((r) => ({ ...r.order, storeName: r.storeName })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
