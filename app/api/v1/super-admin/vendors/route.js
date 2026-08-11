import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, stores } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every vendor account, for the identity-verification queue - see
// users.approvalStatus in lib/db/schema.js. Includes their store name(s)
// so an admin doesn't need to cross-reference the Stores page separately.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const conditions = [eq(users.role, "vendor")];
  if (status) conditions.push(eq(users.approvalStatus, status));
  if (q) conditions.push(or(ilike(users.firstName, `%${q}%`), ilike(users.lastName, `%${q}%`), ilike(users.email, `%${q}%`)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        approvalStatus: users.approvalStatus,
        nin: users.nin,
        ninSubmittedAt: users.ninSubmittedAt,
        approvalReviewNote: users.approvalReviewNote,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.ninSubmittedAt), desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(and(...conditions)),
  ]);

  const namesByOwner = new Map();
  if (rows.length > 0) {
    const storeNames = await db
      .select({ ownerId: stores.ownerId, name: stores.name })
      .from(stores)
      .where(inArray(stores.ownerId, rows.map((r) => r.id)));
    for (const s of storeNames) {
      const list = namesByOwner.get(s.ownerId) || [];
      list.push(s.name);
      namesByOwner.set(s.ownerId, list);
    }
  }

  const vendors = rows.map((r) => ({ ...r, storeNames: namesByOwner.get(r.id) || [] }));

  return NextResponse.json({
    vendors,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
