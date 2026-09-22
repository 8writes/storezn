import { randomUUID } from "node:crypto";
import { db } from "./db/index.js";
import { storeUploads } from "./db/schema.js";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { deletePublicFile } from "./storage/index.js";

// Storage metering ledger - one row per uploaded file still in use.
// Usage is always computed as SUM(sizeBytes), never cached on stores
// itself, so a delete/replace naturally corrects it instead of drifting.
// See lib/storePlan.js's getStorageLimitBytes for the plan-based cap this
// is checked against.

export async function recordStoreUpload({ storeId, url, sizeBytes, purpose }) {
  await db.insert(storeUploads).values({ storeId, url, sizeBytes, purpose });
}

// Reserve bytes before an object is sent to storage. The reservation itself
// counts toward usage, so two concurrent uploads cannot both pass the quota
// check. A short-lived placeholder row is finalized after the provider returns
// the real URL and is cleaned up if the browser/server dies mid-upload.
export async function reserveStoreUpload({ storeId, sizeBytes, limitBytes, purpose }) {
  const id = randomUUID();
  const reservationPurpose = `${purpose}-uploading`;
  const placeholderUrl = `store-upload-reservation://${id}`;

  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`store-upload:${storeId}`}))`);
    const [{ total }] = await tx
      .select({ total: sql`coalesce(sum(${storeUploads.sizeBytes}), 0)`.mapWith(Number) })
      .from(storeUploads)
      .where(eq(storeUploads.storeId, storeId));
    if (Number(total) + sizeBytes > limitBytes) return null;

    await tx.insert(storeUploads).values({
      id,
      storeId,
      url: placeholderUrl,
      sizeBytes,
      purpose: reservationPurpose,
    });
    return { id, placeholderUrl, reservationPurpose };
  });

  return reserved;
}

export async function finalizeStoreUpload({ id, url, purpose }) {
  const [updated] = await db
    .update(storeUploads)
    .set({ url, purpose })
    .where(and(eq(storeUploads.id, id), eq(storeUploads.purpose, `${purpose}-uploading`)))
    .returning({ id: storeUploads.id });
  if (!updated) throw new Error("Upload reservation was not found");
}

export async function releaseStoreUploadReservation(id) {
  await db.delete(storeUploads).where(eq(storeUploads.id, id));
}

export async function removeStoreUpload(url) {
  await db.delete(storeUploads).where(eq(storeUploads.url, url));
}

export async function claimStoreUpload(url, purpose = "review-image") {
  await db.update(storeUploads).set({ purpose }).where(and(eq(storeUploads.url, url), eq(storeUploads.purpose, "review-image-pending")));
}

export async function cleanupStaleStoreUploads(storeId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const stale = await db
    .select({ id: storeUploads.id, url: storeUploads.url })
    .from(storeUploads)
    .where(
      and(
        eq(storeUploads.storeId, storeId),
        lt(storeUploads.createdAt, cutoff),
        or(eq(storeUploads.purpose, "review-image-pending"), sql`${storeUploads.purpose} like '%-uploading'`),
      ),
    )
    .limit(100);
  let removed = 0;
  for (const upload of stale) {
    try {
      await deletePublicFile(upload.url);
    } catch (error) {
      // Keep the ledger row when remote deletion fails so the next run can retry.
      console.error("Failed to delete stale store upload", { uploadId: upload.id, error });
      continue;
    }
    await db.delete(storeUploads).where(eq(storeUploads.id, upload.id));
    removed += 1;
  }
  return removed;
}

export async function cleanupStaleReviewUploads(storeId) {
  return cleanupStaleStoreUploads(storeId);
}

export async function getStoreStorageUsage(storeId) {
  const [{ total }] = await db
    .select({ total: sql`coalesce(sum(${storeUploads.sizeBytes}), 0)`.mapWith(Number) })
    .from(storeUploads)
    .where(eq(storeUploads.storeId, storeId));
  return total;
}
