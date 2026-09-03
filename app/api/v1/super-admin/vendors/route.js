import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, stores, pushSubscriptions } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every vendor account, for the identity-verification queue - see
// users.approvalStatus in lib/db/schema.js. Includes their store name(s)
// so an admin doesn't need to cross-reference the Stores page separately.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        phone: users.phone,
        emailVerified: users.emailVerified,
        emailNotificationsEnabled: users.emailNotificationsEnabled,
        isBanned: users.isBanned,
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
  const whatsappByOwner = new Map();
  const pushCountByUser = new Map();
  if (rows.length > 0) {
    const ownerIds = rows.map((r) => r.id);
    const [storeRows, pushRows] = await Promise.all([
      db
        .select({ ownerId: stores.ownerId, name: stores.name, socialLinks: stores.socialLinks })
        .from(stores)
        .where(inArray(stores.ownerId, ownerIds)),
      // One row per browser/device the vendor has opted into push on -
      // count them so an admin can see reachability at a glance (0 = not
      // subscribed). staffId/customerId rows are irrelevant here.
      db
        .select({ userId: pushSubscriptions.userId, devices: count() })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, ownerIds))
        .groupBy(pushSubscriptions.userId),
    ]);
    for (const s of storeRows) {
      const list = namesByOwner.get(s.ownerId) || [];
      list.push(s.name);
      namesByOwner.set(s.ownerId, list);
      const wa = s.socialLinks?.whatsapp;
      if (wa && !whatsappByOwner.has(s.ownerId)) whatsappByOwner.set(s.ownerId, wa);
    }
    for (const p of pushRows) pushCountByUser.set(p.userId, Number(p.devices) || 0);
  }

  // nin holds RSA-OAEP ciphertext (see lib/ninClient.js) - never returned
  // in bulk, only whether one exists. GET /api/v1/super-admin/vendors/
  // [id]/nin decrypts one at a time, on demand, when an admin reveals it.
  const vendors = rows.map(({ nin, ...r }) => ({
    ...r,
    hasNin: !!nin,
    storeNames: namesByOwner.get(r.id) || [],
    whatsapp: whatsappByOwner.get(r.id) || null,
    pushDeviceCount: pushCountByUser.get(r.id) || 0,
  }));

  return NextResponse.json({
    vendors,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
