import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { devices, deviceAccounts, bannedDevices, signupAbuseEvents } from "../../../../../lib/db/schema.js";
import { and, count, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// Every device that's signed in / signed up, with the account emails
// seen on it, so a super-admin can browse and ban straight from the row.
// ?q= matches a device id, an email on it, an ip, or a fingerprint.
// ?banned=1 shows only currently-barred devices. super_admin + admin.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(sp);
  const q = sp.get("q")?.trim();
  const onlyBanned = sp.get("banned") === "1";

  const conditions = [];
  if (q) {
    const like = `%${q}%`;
    // Device ids that carry a matching email, then fold that into the id/ip/fp match.
    const viaEmail = db
      .select({ deviceId: deviceAccounts.deviceId })
      .from(deviceAccounts)
      .where(ilike(deviceAccounts.email, like));
    conditions.push(
      or(
        ilike(devices.deviceId, like),
        ilike(devices.lastIp, like),
        ilike(devices.fingerprint, like),
        inArray(devices.deviceId, viaEmail),
      ),
    );
  }
  if (onlyBanned) {
    const bannedIds = db.select({ deviceId: bannedDevices.deviceId }).from(bannedDevices).where(isNull(bannedDevices.unbannedAt));
    conditions.push(inArray(devices.deviceId, bannedIds));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(devices).where(where).orderBy(desc(devices.lastSeenAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(devices).where(where),
  ]);

  const ids = rows.map((r) => r.deviceId);
  const [accountRows, banRows, abuseRows] = ids.length
    ? await Promise.all([
        db.select().from(deviceAccounts).where(inArray(deviceAccounts.deviceId, ids)),
        db.select().from(bannedDevices).where(and(inArray(bannedDevices.deviceId, ids), isNull(bannedDevices.unbannedAt))),
        db
          .select({ deviceId: signupAbuseEvents.deviceId, n: sql`count(*)`.mapWith(Number) })
          .from(signupAbuseEvents)
          .where(and(inArray(signupAbuseEvents.deviceId, ids), gt(signupAbuseEvents.createdAt, sql`now() - interval '30 days'`)))
          .groupBy(signupAbuseEvents.deviceId),
      ])
    : [[], [], []];

  const byDevice = new Map(ids.map((id) => [id, { accounts: [], banned: null, abuse30d: 0 }]));
  for (const a of accountRows) byDevice.get(a.deviceId)?.accounts.push({ type: a.accountType, id: a.accountId, email: a.email, lastSeenAt: a.lastSeenAt });
  for (const b of banRows) if (byDevice.has(b.deviceId)) byDevice.get(b.deviceId).banned = { id: b.id, reason: b.reason, autoFlagged: b.autoFlagged, bannedAt: b.bannedAt };
  for (const e of abuseRows) if (byDevice.has(e.deviceId)) byDevice.get(e.deviceId).abuse30d = e.n;

  return NextResponse.json({
    devices: rows.map((r) => ({ ...r, ...byDevice.get(r.deviceId) })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
