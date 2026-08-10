import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { products, stores } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, isNotNull, isNull } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every product across every store, for admin moderation - see
// products.suspendedAt in lib/db/schema.js for the suspend action.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const suspended = searchParams.get("suspended");
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [];
  if (q) conditions.push(ilike(products.name, `%${q}%`));
  if (suspended === "true") conditions.push(isNotNull(products.suspendedAt));
  if (suspended === "false") conditions.push(isNull(products.suspendedAt));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        price: products.price,
        productType: products.productType,
        isActive: products.isActive,
        suspendedAt: products.suspendedAt,
        suspendedReason: products.suspendedReason,
        createdAt: products.createdAt,
        storeId: stores.id,
        storeName: stores.name,
      })
      .from(products)
      .innerJoin(stores, eq(products.storeId, stores.id))
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return NextResponse.json({
    products: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
