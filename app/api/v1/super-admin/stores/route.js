import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores } from "../../../../../lib/db/schema.js";
import { and, count, ilike, or } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Stores are created via vendor self-signup (/api/v1/vendor/signup), not
// by the super_admin - this is a read-only oversight list.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const conditions = q ? [or(ilike(stores.name, `%${q}%`), ilike(stores.slug, `%${q}%`))] : [];
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.query.stores.findMany({
      where,
      with: { owner: true },
      orderBy: stores.createdAt,
      limit,
      offset,
    }),
    db.select({ total: count() }).from(stores).where(where),
  ]);

  return NextResponse.json({
    stores: rows.map(({ owner, ...s }) => ({
      ...s,
      owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, email: owner.email } : null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
