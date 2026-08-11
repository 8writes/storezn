import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike } from "drizzle-orm";
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
  const conditions = [eq(orders.storeId, storeId), eq(orders.paymentStatus, "paid")];
  if (status) conditions.push(eq(orders.status, status));
  if (q) conditions.push(ilike(orders.orderNumber, `%${q}%`));

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(orders).where(and(...conditions)),
  ]);

  return NextResponse.json({
    orders: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
