import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { blockedEmails } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(blockedEmails).where(eq(blockedEmails.id, id));
  return NextResponse.json({ ok: true });
}
