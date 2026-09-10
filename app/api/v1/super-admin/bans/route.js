import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { bannedDevices, signupAbuseEvents, customers } from "../../../../../lib/db/schema.js";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, createBanSchema } from "../../../../../lib/validate.js";
import { banDevice } from "../../../../../lib/deviceBan.js";
import { logActivity } from "../../../../../lib/activityLog.js";

// Device-ban review: the list of barred devices (auto + manual) and the
// recent abuse-event stream. super_admin + admin.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [devices, events, [{ active }]] = await Promise.all([
    db.select().from(bannedDevices).orderBy(desc(bannedDevices.bannedAt)).limit(200),
    db.select().from(signupAbuseEvents).orderBy(desc(signupAbuseEvents.createdAt)).limit(100),
    db.select({ active: sql`count(*)`.mapWith(Number) }).from(bannedDevices).where(isNull(bannedDevices.unbannedAt)),
  ]);

  // Rolled-up abuse per device over the last 24h, for the "watch list".
  const rollup = await db
    .select({
      deviceId: signupAbuseEvents.deviceId,
      n: sql`count(*)`.mapWith(Number),
      last: sql`max(${signupAbuseEvents.createdAt})`,
    })
    .from(signupAbuseEvents)
    .where(gt(signupAbuseEvents.createdAt, sql`now() - interval '24 hours'`))
    .groupBy(signupAbuseEvents.deviceId)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  return NextResponse.json({ devices, events, rollup, activeCount: active });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const result = validate(createBanSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { customerId, deviceId, fingerprint, banSignupDevice, reason } = result.data;

  let subjectEmail = null;
  let subjectCustomerId = null;
  let devIdToBan = deviceId || null;

  if (customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!c) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    subjectEmail = c.email;
    subjectCustomerId = c.id;
    await db.update(customers).set({ isBanned: true, bannedReason: reason, bannedBy: user.id, bannedAt: new Date() }).where(eq(customers.id, customerId));
    if (banSignupDevice && c.signupDeviceId) devIdToBan = c.signupDeviceId;
  }

  let device = null;
  if (devIdToBan || fingerprint) {
    device = await banDevice({ deviceId: devIdToBan, fingerprint: fingerprint || null, reason, autoFlagged: false, bannedBy: user.id, subjectEmail, customerId: subjectCustomerId });
  }

  after(() =>
    logActivity({
      user,
      action: "ban.create",
      targetType: subjectCustomerId ? "customer" : "device",
      targetId: subjectCustomerId || device?.id || devIdToBan || fingerprint,
      metadata: { reason, customerId: subjectCustomerId, deviceId: devIdToBan, fingerprint: fingerprint || null, subjectEmail },
    }),
  );

  return NextResponse.json({ ok: true, device }, { status: 201 });
}
