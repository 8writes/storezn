import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, stores, orders } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const storeId = searchParams.get("storeId");
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [eq(users.role, "customer")];
  if (storeId) conditions.push(eq(users.storeId, storeId));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        createdAt: users.createdAt,
        storeName: stores.name,
        orderCount: sql`count(${orders.id}) filter (where ${orders.paymentStatus} = 'paid')`.mapWith(Number),
        totalSpent: sql`coalesce(sum(${orders.totalAmount}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(Number),
      })
      .from(users)
      .leftJoin(stores, eq(users.storeId, stores.id))
      .leftJoin(orders, eq(orders.userId, users.id))
      .where(and(...conditions))
      .groupBy(users.id, stores.name)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(and(...conditions)),
  ]);

  return NextResponse.json({
    customers: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
