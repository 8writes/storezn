import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores, staff } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { removeStaffMember } from "../../../../../../../../lib/staff.js";

// A real DELETE, not a soft-delete - staff no longer shares a table with
// any other role (see lib/db/schema.js's users/staff/customers split),
// so there's no revocation-ordering hazard to protect against by keeping
// the row around. getUser() simply finds nothing once the row is gone,
// which blocks their existing JWT on the very next request the same way
// a deletedAt flag used to. Scoped to this exact storeId so the endpoint
// can't be pointed at another store's staff id to delete them instead.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, staffId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.storeId, storeId))).limit(1);
  if (!staffRow) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  await removeStaffMember(staffId);

  return NextResponse.json({ ok: true });
}
