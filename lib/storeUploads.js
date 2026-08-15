import { db } from "./db/index.js";
import { storeUploads } from "./db/schema.js";
import { eq, sql } from "drizzle-orm";

// Storage metering ledger - one row per uploaded file still in use.
// Usage is always computed as SUM(sizeBytes), never cached on stores
// itself, so a delete/replace naturally corrects it instead of drifting.
// See lib/storePlan.js's getStorageLimitBytes for the plan-based cap this
// is checked against.

export async function recordStoreUpload({ storeId, url, sizeBytes, purpose }) {
  await db.insert(storeUploads).values({ storeId, url, sizeBytes, purpose });
}

export async function removeStoreUpload(url) {
  await db.delete(storeUploads).where(eq(storeUploads.url, url));
}

export async function getStoreStorageUsage(storeId) {
  const [{ total }] = await db
    .select({ total: sql`coalesce(sum(${storeUploads.sizeBytes}), 0)`.mapWith(Number) })
    .from(storeUploads)
    .where(eq(storeUploads.storeId, storeId));
  return total;
}
