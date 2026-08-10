import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { validate, updateProfileAndNotificationsSchema, changePasswordSchema } from "../../../../../lib/validate.js";

export async function GET(req) {
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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  if (body.currentPassword || body.newPassword) {
    const result = validate(changePasswordSchema, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const valid = await bcrypt.compare(result.data.currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const passwordHash = await bcrypt.hash(result.data.newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return NextResponse.json({ success: true });
  }

  const result = validate(updateProfileAndNotificationsSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [updated] = await db.update(users).set(result.data).where(eq(users.id, user.id)).returning();
  const { passwordHash: _, ...safeUser } = updated;
  return NextResponse.json({ user: safeUser });
}
