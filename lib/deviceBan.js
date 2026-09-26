import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { bannedDevices, signupAbuseEvents } from "./db/schema.js";

// Rolling-window thresholds for the automatic device ban.
const WINDOW_HOURS = 24;
const AUTO_BAN_SIGNUPS = 3; // this-many self-signups from one device in 24h
const AUTO_BAN_ABUSE = 4; // this-many blocked/banned/burst events in 24h

const since = () => sql`now() - interval '${sql.raw(String(WINDOW_HOURS))} hours'`;

// Is this device barred? Matches an active row on the device id (the
// high-entropy localStorage uuid) OR, only for a ban a human placed by
// hand, the browser fingerprint. Auto-bans deliberately do NOT enforce
// on fingerprint: it's a ~9-signal hash that thousands of real users on
// the same phone model share, so honouring an auto fingerprint match
// would lock out unrelated people. The fingerprint is still recorded for
// the review UI.
export async function isDeviceBanned({ deviceId, fingerprint }) {
  const clauses = [];
  if (deviceId) clauses.push(eq(bannedDevices.deviceId, deviceId));
  if (fingerprint) clauses.push(and(eq(bannedDevices.fingerprint, fingerprint), eq(bannedDevices.autoFlagged, false)));
  if (!clauses.length) return null;
  const [row] = await db
    .select()
    .from(bannedDevices)
    .where(and(clauses.length === 1 ? clauses[0] : or(...clauses), isNull(bannedDevices.unbannedAt)))
    .limit(1);
  return row || null;
}

export async function banDevice({ deviceId, fingerprint, reason, autoFlagged = false, bannedBy = null, subjectEmail = null, customerId = null }) {
  const existing = await isDeviceBanned({ deviceId, fingerprint });
  if (existing) return existing;
  const [row] = await db
    .insert(bannedDevices)
    .values({ deviceId: deviceId || null, fingerprint: fingerprint || null, reason: reason || null, autoFlagged, bannedBy, subjectEmail, customerId: customerId || null })
    .returning();
  _banCache = null; // a fresh ban must bite the hot path right away
  return row;
}

// A tiny in-process cache of every ACTIVE ban's device id + (manual)
// fingerprint, so getUser() can reject a barred device on every request
// without a query each time. Refreshed at most every 15s; cleared on
// banDevice() / liftBan() so a new ban / lift is felt within one request
// on the instance that made the change, and within 15s everywhere else.
let _banCache = null; // { at, ids:Set, fps:Set }
const BAN_CACHE_MS = 15_000;

async function loadBanCache() {
  const rows = await db
    .select({ deviceId: bannedDevices.deviceId, fingerprint: bannedDevices.fingerprint, autoFlagged: bannedDevices.autoFlagged })
    .from(bannedDevices)
    .where(isNull(bannedDevices.unbannedAt));
  const ids = new Set();
  const fps = new Set();
  for (const r of rows) {
    if (r.deviceId) ids.add(r.deviceId);
    if (r.fingerprint && !r.autoFlagged) fps.add(r.fingerprint); // manual bans only, same rule as isDeviceBanned
  }
  _banCache = { at: Date.now(), ids, fps };
  return _banCache;
}

// Fast path for the auth middleware: true if this device is barred.
// Best-effort - a DB hiccup here must never wedge every authed request,
// so it fails open (returns false).
export async function isDeviceBannedFast({ deviceId, fingerprint }) {
  try {
    if (!_banCache || Date.now() - _banCache.at > BAN_CACHE_MS) await loadBanCache();
    if (!_banCache) return false;
    return (deviceId && _banCache.ids.has(deviceId)) || (fingerprint && _banCache.fps.has(fingerprint));
  } catch {
    return false;
  }
}

export function clearBanCache() {
  _banCache = null;
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

// How many accounts were created from one device / one network in the
// rolling window. `table` is `customers` or `users` - both carry
// signupDeviceId, signupIp and createdAt (see lib/db/schema.js), and both
// self-signup routes need the same count, so the query lives here rather
// than being written out twice.
export async function countRecentSignups(table, column, value) {
  if (!value) return 0;
  const [{ n }] = await db
    .select({ n: sql`count(*)`.mapWith(Number) })
    .from(table)
    .where(and(eq(column, value), gt(table.createdAt, since())));
  return n;
}

// How many MORE vendor accounts one device / one network may create in the
// window. Deliberately looser than the customer thresholds above and
// deliberately a soft cap (no automatic device ban): a vendor signup is a
// business onboarding, and an agency setting up several clients from one
// laptop is a real pattern, so the cost of a false positive here is much
// higher than on the shopper path. Outright abuse still gets caught by the
// block-list path, which does auto-ban.
export const VENDOR_SIGNUP_DEVICE_MAX = 3;
export const VENDOR_SIGNUP_IP_MAX = 6;

export const AUTO_BAN = { WINDOW_HOURS, AUTO_BAN_SIGNUPS, AUTO_BAN_ABUSE };
