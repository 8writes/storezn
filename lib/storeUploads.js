import { randomUUID } from "node:crypto";
import { db } from "./db/index.js";
import { storeUploads } from "./db/schema.js";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
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

// `pending` parks the finished file as "<purpose>-pending" instead of
// "<purpose>". A pending row is swept by cleanupStaleStoreUploads once it
// is a day old, so a file uploaded on a form that was never saved (the
// new-product page uploads each photo the moment it is picked, long
// before the product row exists) stops counting against the store's quota
// forever. claimStoreUploads below is what promotes it to permanent, and
// is only called once something actually references the URL.
export async function finalizeStoreUpload({ id, url, purpose, pending = false }) {
  const [updated] = await db
    .update(storeUploads)
    .set({ url, purpose: pending ? `${purpose}-pending` : purpose })
    .where(and(eq(storeUploads.id, id), eq(storeUploads.purpose, `${purpose}-uploading`)))
    .returning({ id: storeUploads.id });
  if (!updated) throw new Error("Upload reservation was not found");
}

export async function releaseStoreUploadReservation(id) {
  await db.delete(storeUploads).where(eq(storeUploads.id, id));
}

// Which of these URLs were actually uploaded by THIS store. The ledger is
// written for every upload (see reserveStoreUpload/finalizeStoreUpload and
// the review-image route), so a URL missing from it is either another
// store's file or something never uploaded through us at all.
//
// Media fields are plain z.string().url() on the wire (see
// updateProductSchema/updateVendorStoreSchema), so without this a vendor
// could paste a rival store's public image URL into their own product,
// then remove it again and have our own cleanup destroy the rival's file
// and drop its metered-usage row. Both halves are guarded: a URL can only
// be ATTACHED if this store owns it, and only an owned URL is ever passed
// to deletePublicFile.
export async function filterStoreOwnedUploadUrls(storeId, urls) {
  const unique = [...new Set((urls || []).filter((url) => typeof url === "string" && url))];
  if (!storeId || unique.length === 0) return new Set();
  const rows = await db
    .select({ url: storeUploads.url })
    .from(storeUploads)
    .where(and(eq(storeUploads.storeId, storeId), inArray(storeUploads.url, unique)));
  return new Set(rows.map((row) => row.url));
}

export async function removeStoreUpload(url) {
  await db.delete(storeUploads).where(eq(storeUploads.url, url));
}

// Promotes this store's pending uploads to permanent, once a product row
// (or store setting) actually references them. Anything already permanent,
// or belonging to another store, is left untouched - so this doubles as
// the write-side counterpart to filterStoreOwnedUploadUrls. Call it AFTER
// the write that references the URL succeeds, never before: a claim on a
// save that then 409s would re-create the very orphan this prevents.
export async function claimStoreUploads(storeId, urls) {
  const unique = [...new Set((urls || []).filter((url) => typeof url === "string" && url))];
  if (!storeId || unique.length === 0) return 0;
  const claimed = await db
    .update(storeUploads)
    .set({ purpose: sql`regexp_replace(${storeUploads.purpose}, '-pending$', '')` })
    .where(
      and(
        eq(storeUploads.storeId, storeId),
        inArray(storeUploads.url, unique),
        sql`${storeUploads.purpose} like '%-pending'`,
      ),
    )
    .returning({ id: storeUploads.id });
  return claimed.length;
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
        or(sql`${storeUploads.purpose} like '%-pending'`, sql`${storeUploads.purpose} like '%-uploading'`),
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
