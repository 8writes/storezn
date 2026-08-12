import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores, users } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";

// Soft delete (users.deletedAt) rather than a hard delete - getUser()
// already refuses any user with deletedAt set, so this revokes their
// access immediately (their existing JWT stops working on the very next
// request), same as a store being disabled. Scoped to role="staff" and
// this exact storeId so the endpoint can't be pointed at some other
// user id to delete them instead.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, staffId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [staffUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, staffId), eq(users.storeId, storeId), eq(users.role, "staff")))
    .limit(1);
  if (!staffUser) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, staffId));

  return NextResponse.json({ ok: true });
}
