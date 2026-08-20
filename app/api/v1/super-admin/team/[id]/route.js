import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { users, tokens, pushSubscriptions } from "../../../../../../lib/db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { validate, updateTeamMemberSchema } from "../../../../../../lib/validate.js";

async function loadMember(id) {
  const [member] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), inArray(users.role, ["admin", "p_staff"])))
    .limit(1);
  return member;
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await loadMember(id);
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateTeamMemberSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const data = {};
  if (result.data.role !== undefined) data.role = result.data.role;
  if (result.data.isBanned !== undefined) data.isBanned = result.data.isBanned;

  const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
  const { passwordHash: _, ...safeMember } = updated;
  return NextResponse.json({ member: safeMember });
}

// Real DELETE, same as staff removal (lib/staff.js's removeStaffMember) -
// dependent tokens/pushSubscriptions rows are cleared first to avoid the
// FK constraint violation that pattern already ran into once.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await loadMember(id);
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(tokens).where(eq(tokens.userId, id));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
    await tx.delete(users).where(eq(users.id, id));
  });

  return NextResponse.json({ ok: true });
}
