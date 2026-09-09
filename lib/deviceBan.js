import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { bannedDevices, signupAbuseEvents } from "./db/schema.js";

// Rolling-window thresholds for the automatic device ban.
const WINDOW_HOURS = 24;
const AUTO_BAN_SIGNUPS = 3; // this-many self-signups from one device in 24h
const AUTO_BAN_ABUSE = 4; // this-many blocked/banned/burst events in 24h

const since = () => sql`now() - interval '${sql.raw(String(WINDOW_HOURS))} hours'`;

// Is this device barred? Matches an active row on the device id OR the
// browser fingerprint (a cleared localStorage still gets caught).
export async function isDeviceBanned({ deviceId, fingerprint }) {
  const idMatch = deviceId ? eq(bannedDevices.deviceId, deviceId) : null;
  const fpMatch = fingerprint ? eq(bannedDevices.fingerprint, fingerprint) : null;
  const any = idMatch && fpMatch ? or(idMatch, fpMatch) : idMatch || fpMatch;
  if (!any) return null;
  const [row] = await db
    .select()
    .from(bannedDevices)
    .where(and(any, isNull(bannedDevices.unbannedAt)))
    .limit(1);
  return row || null;
}

export async function banDevice({ deviceId, fingerprint, reason, autoFlagged = false, bannedBy = null, subjectEmail = null }) {
  const existing = await isDeviceBanned({ deviceId, fingerprint });
  if (existing) return existing;
  const [row] = await db
    .insert(bannedDevices)
    .values({ deviceId: deviceId || null, fingerprint: fingerprint || null, reason: reason || null, autoFlagged, bannedBy, subjectEmail })
    .returning();
  return row;
}

export async function logAbuseEvent({ deviceId, fingerprint, ip, normalizedEmail, kind }) {
  try {
    await db.insert(signupAbuseEvents).values({ deviceId: deviceId || null, fingerprint: fingerprint || null, ip: ip || null, normalizedEmail: normalizedEmail || null, kind });
  } catch {
    /* logging must never block a request */
  }
}

async function countEvents(deviceId) {
  if (!deviceId) return 0;
  const [{ n }] = await db
    .select({ n: sql`count(*)`.mapWith(Number) })
    .from(signupAbuseEvents)
    .where(and(eq(signupAbuseEvents.deviceId, deviceId), gt(signupAbuseEvents.createdAt, since())));
  return n;
}

// Call AFTER logging the triggering event. Returns the ban row if it
// auto-banned this device now (or was already banned), else null.
export async function maybeAutoBanFromAbuse({ deviceId, fingerprint, ip, subjectEmail }) {
  const n = await countEvents(deviceId);
  if (n < AUTO_BAN_ABUSE) return null;
  return banDevice({ deviceId, fingerprint, reason: `Auto: ${n} blocked/suspicious signup attempts in ${WINDOW_HOURS}h`, autoFlagged: true, subjectEmail });
}

export const AUTO_BAN = { WINDOW_HOURS, AUTO_BAN_SIGNUPS, AUTO_BAN_ABUSE };
