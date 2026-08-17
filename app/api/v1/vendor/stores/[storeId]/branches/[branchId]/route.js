import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores, branches, staff, orders, productBranchStock } from "../../../../../../../../lib/db/schema.js";
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { validate, updateBranchSchema } from "../../../../../../../../lib/validate.js";

const TERMINAL_STATUSES = ["delivered", "cancelled", "refunded", "refund_declined"];

async function loadStoreAndBranch(storeId, branchId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { store: null, branch: null };
  const [branch] = await db.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.storeId, storeId))).limit(1);
  return { store, branch };
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, branchId } = await params;
  const { store, branch } = await loadStoreAndBranch(storeId, branchId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateBranchSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: "No changes to update" }, { status: 400 });
  }

  const [updated] = await db.update(branches).set(result.data).where(eq(branches.id, branchId)).returning();
  return NextResponse.json({ branch: updated });
}

// The default branch can be renamed but never deleted (every store must
// always have at least one, see branches.isDefault) - and any other
// branch can only go once it's genuinely empty: no staff still assigned,
// no non-terminal order, no stock anywhere. Same "don't allow
// destructive orphaning" instinct as everywhere else in this app -
// the vendor has to reassign/clear first rather than this silently
// dropping data.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, branchId } = await params;
  const { store, branch } = await loadStoreAndBranch(storeId, branchId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  if (branch.isDefault) return NextResponse.json({ error: "The default branch can't be deleted" }, { status: 400 });

  const [staffMember] = await db.select({ id: staff.id }).from(staff).where(eq(staff.branchId, branchId)).limit(1);
  if (staffMember) return NextResponse.json({ error: "Reassign this branch's staff before deleting it" }, { status: 409 });

  const [pendingOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.branchId, branchId), notInArray(orders.status, TERMINAL_STATUSES)))
    .limit(1);
  if (pendingOrder) return NextResponse.json({ error: "This branch still has orders in progress" }, { status: 409 });

  // Null (unlimited) counts as "still configured" here too, not "empty" -
  // a vendor who explicitly set a branch to unlimited for some item
  // presumably still wants that item tracked there.
  const [stockedItem] = await db
    .select({ id: productBranchStock.id })
    .from(productBranchStock)
    .where(and(eq(productBranchStock.branchId, branchId), or(isNull(productBranchStock.stock), ne(productBranchStock.stock, 0))))
    .limit(1);
  if (stockedItem) return NextResponse.json({ error: "Clear this branch's stock to 0 before deleting it" }, { status: 409 });

  await db.transaction(async (tx) => {
    await tx.delete(productBranchStock).where(eq(productBranchStock.branchId, branchId));
    await tx.delete(branches).where(eq(branches.id, branchId));
  });

  return NextResponse.json({ ok: true });
}
