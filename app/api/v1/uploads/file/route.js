import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { uploadPublicFile, deletePublicFile, generateObjectKey, isOwnedUploadUrl } from "../../../../../lib/storage/index.js";
import { db } from "../../../../../lib/db/index.js";
import { stores, platformSettings } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getStorageLimitBytes } from "../../../../../lib/storePlan.js";
import { recordStoreUpload, getStoreStorageUsage, removeStoreUpload } from "../../../../../lib/storeUploads.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// A 30s cap is enforced client-side only (see the product forms' duration
// check before upload even starts) - there's no ffprobe/media-inspection
// tooling on this server to re-verify duration server-side. The 20MB size
// cap below is the real, unbypassable backstop.
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
// store-logo/store-favicon are cropped client-side to a fixed small
// canvas size before upload (see ImageCropModal), so they never approach
// even this generous ceiling - product-image is the one uploaded as-is
// straight from the vendor's camera roll, so it gets its own tighter cap.
const MAX_SIZE_BY_PURPOSE = {
  "product-image": 1 * 1024 * 1024,
  "product-video": 20 * 1024 * 1024,
  "store-logo": 8 * 1024 * 1024,
  "store-favicon": 8 * 1024 * 1024,
};

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkRateLimit(req, "upload-file", { max: 30, windowMs: 60 * 60_000, userId: user.id });
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

  // Storage is metered per store, not per user - resolve which store this
  // upload counts against. Only vendor/staff hit this route today (see
  // MAX_SIZE_BY_PURPOSE), a customer profile picture goes through the
  // separate /api/v1/uploads/profile flow instead.
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
  const usedBytes = await getStoreStorageUsage(storeIdForUser);
  if (usedBytes + file.size > limitBytes) {
    return NextResponse.json(
      { error: `Storage limit reached (${Math.round(limitBytes / (1024 * 1024))}MB)${store.plan !== "plus" ? " - upgrade to Storezn+ for more space" : ""}` },
      { status: 402 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(`${purpose}/${user.id}`, file.name);
    const url = await uploadPublicFile(buffer, key, file.type);
    await recordStoreUpload({ storeId: storeIdForUser, url, sizeBytes: file.size, purpose });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 502 });
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
export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = body?.url;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "No url provided" }, { status: 400 });
  }
  // generateObjectKey nests every upload under "<purpose>/<user.id>/...",
  // so this doubles as the ownership check - a vendor can only ever
  // delete a file their own account uploaded.
  if (!isOwnedUploadUrl(url, user.id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await Promise.all([deletePublicFile(url), removeStoreUpload(url)]);
  return NextResponse.json({ ok: true });
}
