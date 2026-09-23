import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, orderTenders, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const conditions = [eq(orders.storeId, storeId), or(eq(orders.paymentStatus, "paid"), eq(orders.paymentStatus, "partially_paid"))];
  if (status) conditions.push(eq(orders.status, status));
  if (q) conditions.push(ilike(orders.orderNumber, `%${q}%`));
  // A branch-scoped staff member only sees their own branch's orders -
  // a vendor/owner (branchId always null) still sees every branch.
  if (user.role === "staff" && user.branchId) conditions.push(eq(orders.branchId, user.branchId));

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(orders).where(and(...conditions)),
  ]);

  // Payment method(s) per order for the list (one query, not N+1).
  const ids = rows.map((r) => r.id);
  const tenders = ids.length
    ? await db
        .select({ orderId: orderTenders.orderId, method: orderTenders.method, provider: orderTenders.provider })
        .from(orderTenders)
        .where(inArray(orderTenders.orderId, ids))
    : [];
  const methodsByOrder = new Map();
  for (const t of tenders) {
    const label = t.provider ? `${t.method}:${t.provider}` : t.method;
    const arr = methodsByOrder.get(t.orderId) || [];
    if (!arr.includes(label)) arr.push(label);
    methodsByOrder.set(t.orderId, arr);
  }

  return NextResponse.json({
    orders: rows.map((o) => ({ ...o, paymentMethods: methodsByOrder.get(o.id) || [] })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
