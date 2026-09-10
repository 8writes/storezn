import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { devices, deviceAccounts } from "./db/schema.js";

// Records that `device` was used to authenticate as the given account.
// Best-effort - a failure here must never block a login/signup. Called
// from the login + signup routes (wrap in `after()` at the call site).
export async function recordDeviceUse({ req, device, accountType, accountId, email }) {
  try {
    if (!device?.deviceId) return;
    const ua = (req?.headers?.get("user-agent") || "").slice(0, 400) || null;
    const now = new Date();

    await db
      .insert(devices)
      .values({
        deviceId: device.deviceId,
        fingerprint: device.fingerprint || null,
        firstSeenAt: now,
        lastSeenAt: now,
        lastIp: device.ip || null,
        lastUserAgent: ua,
        seenCount: 1,
      })
      .onConflictDoUpdate({
        target: devices.deviceId,
        set: {
          lastSeenAt: now,
          lastIp: device.ip || null,
          lastUserAgent: ua,
          fingerprint: device.fingerprint || sql`${devices.fingerprint}`,
          seenCount: sql`${devices.seenCount} + 1`,
        },
      });

    if (accountType && accountId) {
      await db
        .insert(deviceAccounts)
        .values({ deviceId: device.deviceId, accountType, accountId, email: email || null, firstSeenAt: now, lastSeenAt: now })
        .onConflictDoUpdate({
          target: [deviceAccounts.deviceId, deviceAccounts.accountType, deviceAccounts.accountId],
          set: { lastSeenAt: now, email: email || null },
        });
    }
  } catch {
    /* device logging is never worth failing auth over */
  }
}
