import { and, isNotNull, lt, ne, or } from "drizzle-orm";
import { db } from "./db/index.js";
import { apiRequestLogs, appErrorLogs, carts, rateLimitBuckets, signupAbuseEvents, stores, tokens } from "./db/schema.js";
import { cleanupStaleStoreUploads } from "./storeUploads.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const API_LOG_RETENTION_DAYS = 7;
const APP_ERROR_RETENTION_DAYS = 30;
const ABUSE_EVENT_RETENTION_DAYS = 30;

async function deleteReturning(table, condition, id) {
  const rows = await db.delete(table).where(condition).returning({ id });
  return rows.length;
}

// Only removes data whose lifecycle is complete or whose retention window has
// ended. Orders, payments, POS records, audit logs, and active customer data
// are intentionally outside this cleanup boundary.
export async function cleanupStaleData(now = new Date()) {
  const apiLogCutoff = new Date(now.getTime() - API_LOG_RETENTION_DAYS * DAY_MS);
  const appErrorCutoff = new Date(now.getTime() - APP_ERROR_RETENTION_DAYS * DAY_MS);
  const abuseEventCutoff = new Date(now.getTime() - ABUSE_EVENT_RETENTION_DAYS * DAY_MS);

  const [tokensDeleted, rateLimitBucketsDeleted, apiRequestLogsDeleted, appErrorLogsDeleted, signupAbuseEventsDeleted] = await Promise.all([
    deleteReturning(tokens, or(lt(tokens.expiresAt, now), and(isNotNull(tokens.usedAt), lt(tokens.usedAt, now))), tokens.id),
    deleteReturning(rateLimitBuckets, lt(rateLimitBuckets.expiresAt, now), rateLimitBuckets.bucketKey),
    deleteReturning(apiRequestLogs, lt(apiRequestLogs.createdAt, apiLogCutoff), apiRequestLogs.id),
    deleteReturning(appErrorLogs, lt(appErrorLogs.createdAt, appErrorCutoff), appErrorLogs.id),
    deleteReturning(signupAbuseEvents, lt(signupAbuseEvents.createdAt, abuseEventCutoff), signupAbuseEvents.id),
  ]);

  // A converted/abandoned cart no longer owns the browser's guest identity.
  // Clearing that token is enough to let the next visit create a fresh cart;
  // deleting carts is deliberately avoided because orders may reference them.
  const clearedCartTokens = await db
    .update(carts)
    .set({ guestToken: null, updatedAt: now })
    .where(and(isNotNull(carts.guestToken), ne(carts.status, "active")))
    .returning({ id: carts.id });

  const storeRows = await db.select({ id: stores.id }).from(stores);
  let staleUploadsDeleted = 0;
  let staleUploadCleanupFailures = 0;
  for (const store of storeRows) {
    try {
      staleUploadsDeleted += await cleanupStaleStoreUploads(store.id);
    } catch (error) {
      staleUploadCleanupFailures += 1;
      console.error("Failed to clean stale store uploads", { storeId: store.id, error });
    }
  }

  return {
    tokensDeleted,
    rateLimitBucketsDeleted,
    apiRequestLogsDeleted,
    appErrorLogsDeleted,
    signupAbuseEventsDeleted,
    cartTokensCleared: clearedCartTokens.length,
    staleUploadsDeleted,
    staleUploadCleanupFailures,
  };
}
