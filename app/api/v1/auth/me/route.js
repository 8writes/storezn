import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users, staff, customers } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { readDevice } from "../../../../../lib/device.js";
import { isDeviceBanned } from "../../../../../lib/deviceBan.js";
import { validate, updateProfileAndNotificationsSchema, changePasswordSchema } from "../../../../../lib/validate.js";

// Shared across every account kind (vendor, staff, customer, super_admin) -
// getUser() already normalizes which table the signed-in principal came
// from onto `.role`, this just maps that back to the right table to
// write to.
function tableForRole(role) {
  if (role === "staff") return staff;
  if (role === "customer") return customers;
  return users;
}

// The client re-validates its stored session against this on load, on
// tab refocus, and on a slow interval - so a ban / suspension / device
// ban boots an already-open session, not just the next login. A device
// ban answers 403 {banned:true} so the client can route to /banned;
// getUser() returning null (account banned/deleted, disabled store,
// dead token) answers 401 and the client logs out to /login.
export async function GET(req) {
  const ban = await isDeviceBanned(readDevice(req));
  if (ban) {
    return NextResponse.json({ error: "Access from this device has been restricted.", banned: true, reason: ban.reason || null }, { status: 403 });
  }
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { passwordHash, ...safeUser } = user;
  return NextResponse.json({ user: safeUser });
}

// One PATCH handles both profile/notification edits and password changes -
// which branch runs depends on whether currentPassword/newPassword were
// sent, since a password change needs its own verification step (confirm
// the current password) that plain profile fields don't.
export async function PATCH(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const table = tableForRole(user.role);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  if (body.currentPassword || body.newPassword) {
    const result = validate(changePasswordSchema, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const valid = await bcrypt.compare(result.data.currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const passwordHash = await bcrypt.hash(result.data.newPassword, 10);
    await db.update(table).set({ passwordHash }).where(eq(table.id, user.id));
    return NextResponse.json({ success: true });
  }

  const result = validate(updateProfileAndNotificationsSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // An empty phone field means "remove it", not "".
  const patch = { ...result.data };
  if (patch.phone === "") patch.phone = null;

  const [updated] = await db.update(table).set(patch).where(eq(table.id, user.id)).returning();
  const { passwordHash: _, ...safeUser } = updated;
  return NextResponse.json({ user: { ...safeUser, role: user.role } });
}
