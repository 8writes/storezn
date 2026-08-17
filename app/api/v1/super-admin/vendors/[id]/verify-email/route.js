import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { users } from "../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../../lib/auth.js";

// Manual override for a vendor stuck unable to even sign in because
// their verification email never arrived (deliverability issue, not
// something they did wrong) - separate from NIN/identity approval (see
// PATCH .../vendors/[id]), which only decides whether their store can go
// live, not whether they can log in at all. One-way, like the same
// override for customers - a confirmed email doesn't need to be
// revocable.
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [vendor] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.role, "vendor"))).limit(1);
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  const [updated] = await db.update(users).set({ emailVerified: true }).where(eq(users.id, id)).returning();

  const { passwordHash: _, nin: __, ...safeVendor } = updated;
  return NextResponse.json({ vendor: safeVendor });
}
