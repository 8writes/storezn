import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { bannedDevices, customers } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";

// Lift a device ban. Any customer accounts that were banned with the same
// reason string as this device row are lifted too (best-effort - a
// device ban and a matching account ban usually go on together).
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db.select().from(bannedDevices).where(eq(bannedDevices.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(bannedDevices)
    .set({ unbannedAt: new Date(), unbannedBy: user.id })
    .where(eq(bannedDevices.id, id));

  if (row.subjectEmail) {
    await db.update(customers).set({ isBanned: false, bannedReason: null }).where(eq(customers.email, row.subjectEmail));
  }

  return NextResponse.json({ ok: true });
}
