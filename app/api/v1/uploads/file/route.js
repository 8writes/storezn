import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { uploadPublicFileWithMetadata, deletePublicFile, generateObjectKey, isOwnedUploadUrl } from "../../../../../lib/storage/index.js";
import { db } from "../../../../../lib/db/index.js";
import { stores, platformSettings } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getStorageLimitBytes } from "../../../../../lib/storePlan.js";
import { reserveStoreUpload, finalizeStoreUpload, releaseStoreUploadReservation, removeStoreUpload, cleanupStaleStoreUploads } from "../../../../../lib/storeUploads.js";
import { logAppError } from "../../../../../lib/appErrorLog.js";
import { withApiMonitoring } from "../../../../../lib/apiMonitoring.js";
import {
  PRODUCT_IMAGE_TYPES,
  PRODUCT_VIDEO_TYPES,
  PRODUCT_IMAGE_UPLOAD_MAX_BYTES,
  PRODUCT_VIDEO_MAX_BYTES,
  PRODUCT_VIDEO_MAX_SECONDS,
  matchesImageSignature,
  matchesVideoSignature,
} from "../../../../../lib/mediaValidation.js";

const ALLOWED_IMAGE_TYPES = PRODUCT_IMAGE_TYPES;
// A 60s cap is checked from browser media metadata before upload starts,
// then enforced again after upload when the configured storage provider
// returns authoritative video duration metadata (Cloudinary does).
const ALLOWED_VIDEO_TYPES = PRODUCT_VIDEO_TYPES;
// store-logo/store-favicon are cropped client-side to a fixed small
// canvas size before upload (see ImageCropModal), so they never approach
// even this generous ceiling - product-image is the one uploaded as-is
// straight from the vendor's camera roll, so it gets its own tighter cap.
const MAX_SIZE_BY_PURPOSE = {
  "product-image": PRODUCT_IMAGE_UPLOAD_MAX_BYTES,
  "product-video": PRODUCT_VIDEO_MAX_BYTES,
  "store-logo": 8 * 1024 * 1024,
  "store-favicon": 8 * 1024 * 1024,
};

async function handlePost(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each product photo/video, plus the store logo and favicon, is one
  // request against this bucket - a vendor loading a real catalogue can
  // legitimately push through a lot of files in one sitting. The hard
  // caps that actually matter are per-file size (below) and the per-store
  // storage quota; this is just a hammering backstop, so it's generous.
  const limit = await checkRateLimit(req, "upload-file", { max: 150, windowMs: 60 * 60_000, userId: user.id, includeIp: true });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const purpose = formData?.get("purpose");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const maxSize = MAX_SIZE_BY_PURPOSE[purpose];
  if (!maxSize) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }
  const isVideo = purpose === "product-video";
  const allowedTypes = isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowedTypes.has(file.type)) {
    return NextResponse.json(
      { error: isVideo ? "Only MP4, WebM, or MOV videos are allowed" : "Only JPEG, PNG, or WebP images are allowed" },
      { status: 400 },
    );
  }
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `${isVideo ? "Video" : "Image"} must be smaller than ${Math.round(maxSize / (1024 * 1024))}MB` },
      { status: 400 },
    );
  }

  const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signatureMatches = isVideo ? matchesVideoSignature(file.type, headerBytes) : matchesImageSignature(file.type, headerBytes);
  if (!signatureMatches) {
    return NextResponse.json(
      { error: isVideo ? "That file does not look like a valid product video" : "That file does not look like a valid image" },
      { status: 400 },
    );
  }

  // Storage is metered per store, not per user - resolve which store this
  // upload counts against. Only vendor/staff hit this route (see
  // MAX_SIZE_BY_PURPOSE); the one other upload path is the customer
  // review photo, which has its own route and its own quota accounting
  // (see /api/v1/storefront/reviews/upload).
  const storeIdForUser =
    user.role === "vendor"
      ? (await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, user.id)).limit(1))[0]?.id
      : user.role === "staff"
        ? user.storeId
        : null;
  if (!storeIdForUser) {
    return NextResponse.json({ error: "No store found for this account" }, { status: 400 });
  }

  const [store] = await db.select().from(stores).where(eq(stores.id, storeIdForUser)).limit(1);
  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  const limitBytes = getStorageLimitBytes(store, settings || { freeStorageMb: 500, plusStorageMb: 5000 });
  await cleanupStaleStoreUploads(storeIdForUser);
  const reservation = await reserveStoreUpload({ storeId: storeIdForUser, sizeBytes: file.size, limitBytes, purpose });
  if (!reservation) {
    return NextResponse.json(
      { error: `Storage limit reached (${Math.round(limitBytes / (1024 * 1024))}MB)${store.plan !== "plus" ? " - upgrade to Storezn+ for more space" : ""}` },
      { status: 402 },
    );
  }

  let url;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(`${purpose}/${user.id}`, file.name);
    const uploaded = await uploadPublicFileWithMetadata(buffer, key, file.type);
    url = uploaded.url;
    if (isVideo && Number.isFinite(uploaded.durationSeconds) && uploaded.durationSeconds > PRODUCT_VIDEO_MAX_SECONDS + 0.25) {
      await deletePublicFile(url);
      await releaseStoreUploadReservation(reservation.id).catch(() => {});
      return NextResponse.json({ error: "Product videos can be up to 1 minute long." }, { status: 400 });
    }
    await finalizeStoreUpload({ id: reservation.id, url, purpose });
    return NextResponse.json({ url });
  } catch (err) {
    if (url) await deletePublicFile(url);
    await releaseStoreUploadReservation(reservation.id).catch(() => {});
    await logAppError(err, {
      req,
      user,
      source: "uploads.file",
      statusCode: 502,
      storeId: storeIdForUser,
      metadata: { purpose, fileType: file.type, fileSize: file.size },
    });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}

// Cleans up a file that was uploaded but never actually got attached to
// anything - e.g. a product photo added on the "new product" page (which
// uploads immediately, see that page's handleImageUpload) and then
// removed again before the product itself was ever created, so there's
// no product row/PATCH to trigger the usual removed-image cleanup (see
// PATCH .../products/[id]). Every other page that manages images already
// attaches its own cleanup to the save/delete that actually removes the
// reference (store logo/favicon PATCH, product image PATCH/DELETE) - this
// route only exists for the case where nothing ever referenced the file.
async function handleDelete(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = body?.url;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "No url provided" }, { status: 400 });
  }
  // generateObjectKey nests every upload under "<purpose>/<user.id>/...",
  // so this doubles as the ownership check - a vendor can only ever
  // delete a file their own account uploaded. Both storage providers
  // answer this through the same predicate (lib/storage/keyOwnership.js).
  if (!isOwnedUploadUrl(url, user.id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await Promise.all([deletePublicFile(url), removeStoreUpload(url)]);
  return NextResponse.json({ ok: true });
}

export const POST = withApiMonitoring(handlePost, { source: "uploads.file.create" });
export const DELETE = withApiMonitoring(handleDelete, { source: "uploads.file.delete" });
