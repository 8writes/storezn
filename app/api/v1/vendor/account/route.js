import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { stores, users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";

// A vendor can't permanently delete their own account (that's a
// super-admin action - see DELETE /api/v1/super-admin/vendors/[id]).
// From here "delete" means DISABLE: password-confirmed, it suspends the
// user and takes every store they own offline. Nothing is destroyed;
// a super-admin can re-enable the store(s) and un-suspend the vendor.
export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "vendor") {
    return NextResponse.json({ error: "Only a store owner can do this from here" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect" }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(stores)
      .set({ isOpen: false, isActive: false, disabledReason: "owner" })
      .where(eq(stores.ownerId, user.id));
    await tx.update(users).set({ isBanned: true }).where(eq(users.id, user.id));
  });

  return NextResponse.json({ ok: true });
}
