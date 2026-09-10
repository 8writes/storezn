import { NextResponse, after } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { bannedDevices, customers } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { logActivity } from "../../../../../../lib/activityLog.js";

// Lift a device ban, and the one customer account it was placed
// alongside (by id). Older rows recorded only an email - for those we
// fall back to email + matching reason so we don't sweep up an unrelated
// ban on a customer that happens to share the address.
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

  const clear = { isBanned: false, bannedReason: null, bannedBy: null, bannedAt: null };
  if (row.customerId) {
    await db.update(customers).set(clear).where(eq(customers.id, row.customerId));
  } else if (row.subjectEmail) {
    await db
      .update(customers)
      .set(clear)
      .where(and(eq(customers.email, row.subjectEmail), eq(customers.bannedReason, row.reason)));
  }

  after(() =>
    logActivity({
      user,
      action: "ban.lift",
      targetType: row.customerId ? "customer" : "device",
      targetId: row.customerId || row.id,
      metadata: { banId: row.id, customerId: row.customerId, deviceId: row.deviceId, subjectEmail: row.subjectEmail },
    }),
  );

  return NextResponse.json({ ok: true });
}
