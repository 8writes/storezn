import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { customers, orders, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// A vendor's own view of their store's customers - same shape as
// /api/v1/super-admin/customers, scoped to one store instead of every
// store on the platform.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const conditions = [eq(customers.storeId, storeId)];
  if (q) conditions.push(or(ilike(customers.firstName, `%${q}%`), ilike(customers.lastName, `%${q}%`), ilike(customers.email, `%${q}%`)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        createdAt: customers.createdAt,
        orderCount: sql`count(${orders.id}) filter (where ${orders.paymentStatus} = 'paid')`.mapWith(Number),
        totalSpent: sql`coalesce(sum(${orders.totalAmount}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(Number),
      })
      .from(customers)
      .leftJoin(orders, eq(orders.userId, customers.id))
      .where(and(...conditions))
      .groupBy(customers.id)
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(customers).where(and(...conditions)),
  ]);

  return NextResponse.json({
    customers: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
