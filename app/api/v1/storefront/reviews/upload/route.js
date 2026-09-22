import { NextResponse } from "next/server";
import { getUser } from "../../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";
import { uploadPublicFile, deletePublicFile, generateObjectKey } from "../../../../../../lib/storage/index.js";
import { db } from "../../../../../../lib/db/index.js";
import { products, platformSettings } from "../../../../../../lib/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { getStorageLimitBytes } from "../../../../../../lib/storePlan.js";
import { reserveStoreUpload, finalizeStoreUpload, releaseStoreUploadReservation, cleanupStaleReviewUploads } from "../../../../../../lib/storeUploads.js";
import { resolveStoreByHost, isStoreLive } from "../../../../../../lib/resolveStore.js";
import { logAppError } from "../../../../../../lib/appErrorLog.js";
import { withApiMonitoring } from "../../../../../../lib/apiMonitoring.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 3 * 1024 * 1024;

// One photo attached to a product review. Customer-auth only (reviews are
// purchase-gated to customers - see the reviews route), image only, 3MB.
// Metered against the storefront's storage quota. The returned URL is keyed
// under review-image/<customerId>/... so the reviews POST can re-verify it
// belongs to the poster before saving it.
async function handlePost(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await checkRateLimit(req, "review-image", { max: 20, windowMs: 60 * 60_000, userId: user.id, includeIp: true });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const productId = typeof formData?.get("productId") === "string" ? formData.get("productId").trim() : "";
  if (!productId) return NextResponse.json({ error: "Product is required" }, { status: 400 });
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be smaller than 3MB" }, { status: 400 });
  }

  const host = req.headers.get("host");
  const store = host ? await resolveStoreByHost(host) : null;
  if (!isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, store.id), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await cleanupStaleReviewUploads(store.id);
  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  const storageLimit = getStorageLimitBytes(store, settings || { freeStorageMb: 500, plusStorageMb: 5000 });
  const reservation = await reserveStoreUpload({ storeId: store.id, sizeBytes: file.size, limitBytes: storageLimit, purpose: "review-image-pending" });
  if (!reservation) {
    return NextResponse.json({ error: "This store has reached its image storage limit" }, { status: 413 });
  }

  let url;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(`review-image/${user.id}`, file.name);
    url = await uploadPublicFile(buffer, key, file.type);
    await finalizeStoreUpload({ id: reservation.id, url, purpose: "review-image-pending" });
    return NextResponse.json({ url });
  } catch (err) {
    if (url) await deletePublicFile(url);
    await releaseStoreUploadReservation(reservation.id).catch(() => {});
    await logAppError(err, { req, user, source: "storefront.review_image_upload", statusCode: 502 });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.review_image_upload" });
