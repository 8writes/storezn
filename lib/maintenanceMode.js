import { db } from "./db/index.js";
import { platformSettings } from "./db/schema.js";

// Read from proxy.js on every non-exempt request, so this is cached
// rather than hitting Postgres per-request - a short TTL keeps the
// toggle feeling near-instant (worst case a few seconds' lag) without a
// query on every page load. Module-level, reused across warm invocations
// of the same function instance, same pattern as the SendPulse token
// cache in lib/email/mailer.js.
const CACHE_MS = 10_000;
let cached = { value: false, expiresAt: 0 };

export async function isMaintenanceModeOn() {
  if (Date.now() < cached.expiresAt) return cached.value;
  try {
    const [row] = await db.select({ maintenanceMode: platformSettings.maintenanceMode }).from(platformSettings).limit(1);
    cached = { value: !!row?.maintenanceMode, expiresAt: Date.now() + CACHE_MS };
  } catch {
    // A DB hiccup shouldn't take the whole site down on top of whatever
    // is already wrong - fail open (site stays reachable) rather than
    // fail closed, and retry on the next request rather than caching the
    // failure.
  }
  return cached.value;
}
