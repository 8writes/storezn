import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";

// A vendor's own store(s) - stores only get created via
// /api/v1/vendor/signup, one per vendor. Staff get the same shape back,
// but scoped to the single store they were invited to (users.storeId)
// rather than by ownership.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["vendor", "staff"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows =
    user.role === "staff"
      ? await db.select().from(stores).where(eq(stores.id, user.storeId))
      : await db.select().from(stores).where(eq(stores.ownerId, user.id)).orderBy(stores.createdAt);
  return NextResponse.json({ stores: rows });
}
