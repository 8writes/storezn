import webpush from "web-push";
import { db } from "./db/index.js";
import { pushSubscriptions, users, staff, stores } from "./db/schema.js";
import { eq, inArray } from "drizzle-orm";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    "mailto:support@ozmictech.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  configured = true;
}

// Shared by sendPushToUsers/sendPushToStaffIds below - which
// pushSubscriptions column to match against depends on which table the
// recipient ids live in (see lib/db/schema.js's users/staff/customers
// split - pushSubscriptions.userId/staffId/customerId are mutually
// exclusive per row). Failures are per-subscription, not per-recipient
// or per-batch: one dead endpoint (uninstalled PWA, revoked permission)
// never blocks the rest, and a 404/410 response - the browser's own way
// of saying "this subscription is gone for good" - prunes that row so
// we stop wasting a request on it every time.
async function sendPushByColumn(column, ids, { title, body, url }) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.error("sendPush: VAPID keys not configured");
    return { sent: 0, failed: 0 };
  }
  if (!ids || ids.length === 0) return { sent: 0, failed: 0 };
  ensureConfigured();

  const subs = await db.select().from(pushSubscriptions).where(inArray(column, ids));
  const payload = JSON.stringify({ title, body, url: url || "/" });

  let sent = 0;
  let failed = 0;
  const dead = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.id);
      }
    }),
  );

  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead)).catch(() => {});
  }

  return { sent, failed };
}

// Sends to every subscription for the given vendor/super_admin user ids
// (a user can have more than one - phone, desktop, etc).
export function sendPushToUsers(userIds, payload) {
  return sendPushByColumn(pushSubscriptions.userId, userIds, payload);
}

function sendPushToStaffIds(staffIds, payload) {
  return sendPushByColumn(pushSubscriptions.staffId, staffIds, payload);
}

export function sendPushToUser(userId, payload) {
  return sendPushToUsers([userId], payload);
}

export async function sendPushToRole(role, payload) {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, role));
  return sendPushToUsers(admins.map((u) => u.id), payload);
}

// Day-to-day operational pushes (new order, low stock) go to everyone who
// actually works the store - the owner and any staff (see isStoreOwner vs
// canManageStore in lib/auth.js: staff can act on orders/stock same as
// the vendor, so they should hear about them the same way). Owner-only
// concerns (verification decisions, payout stuff) should keep using
// sendPushToUser(store.ownerId, ...) directly instead of this.
export async function sendPushToStore(storeId, payload) {
  const [store] = await db.select({ ownerId: stores.ownerId }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { sent: 0, failed: 0 };

  const staffRows = await db.select({ id: staff.id }).from(staff).where(eq(staff.storeId, storeId));

  const [ownerResult, staffResult] = await Promise.all([
    sendPushToUsers([store.ownerId], payload),
    staffRows.length > 0 ? sendPushToStaffIds(staffRows.map((s) => s.id), payload) : Promise.resolve({ sent: 0, failed: 0 }),
  ]);

  return { sent: ownerResult.sent + staffResult.sent, failed: ownerResult.failed + staffResult.failed };
}
