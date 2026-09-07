import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores, staff, branches } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { validate, updateStaffSchema } from "../../../../../../../../lib/validate.js";
import { removeStaffMember } from "../../../../../../../../lib/staff.js";

// Reassign a staff member to a different branch (or clear the scope with
// branchId: null). Owner-only, same as invite/remove - a branch-scoped
// staff member's own branch is what gates what they can see and, e.g.,
// which branch's stock they may edit (see the branch-stock PATCH route).
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, staffId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [staffRow] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.storeId, storeId))).limit(1);
  if (!staffRow) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(updateStaffSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { branchId } = result.data;

  if (branchId) {
    const [branch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, branchId), eq(branches.storeId, storeId))).limit(1);
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  await db.update(staff).set({ branchId: branchId || null }).where(eq(staff.id, staffId));
  return NextResponse.json({ ok: true, branchId: branchId || null });
}

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
