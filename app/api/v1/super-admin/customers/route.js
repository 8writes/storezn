import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { customers, stores, orders } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const storeId = searchParams.get("storeId");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [];
  if (storeId) conditions.push(eq(customers.storeId, storeId));
  if (q) conditions.push(or(ilike(customers.firstName, `%${q}%`), ilike(customers.lastName, `%${q}%`), ilike(customers.email, `%${q}%`)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        createdAt: customers.createdAt,
        storeName: stores.name,
        orderCount: sql`count(${orders.id}) filter (where ${orders.paymentStatus} = 'paid')`.mapWith(Number),
        totalSpent: sql`coalesce(sum(${orders.totalAmount}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(Number),
      })
      .from(customers)
      .leftJoin(stores, eq(customers.storeId, stores.id))
      .leftJoin(orders, eq(orders.userId, customers.id))
      .where(where)
      .groupBy(customers.id, stores.name)
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ]);

  return NextResponse.json({
    customers: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
