import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { page, pageSize, limit, offset } = parsePagination(new URL(req.url).searchParams);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.userId, user.id), isNull(orders.invoiceId))).orderBy(desc(orders.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(orders).where(and(eq(orders.userId, user.id), isNull(orders.invoiceId))),
  ]);

  return NextResponse.json({
    orders: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
