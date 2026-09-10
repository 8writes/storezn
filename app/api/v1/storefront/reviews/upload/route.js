import { NextResponse } from "next/server";
import { getUser } from "../../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";
import { uploadPublicFile, generateObjectKey } from "../../../../../../lib/storage/index.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 3 * 1024 * 1024;

// One photo attached to a product review. Customer-auth only (reviews are
// purchase-gated to customers - see the reviews route), image only, 3MB.
// Not metered against any store's storage quota - it's shopper-generated,
// small, and rate-limited here instead. The returned URL is keyed under
// review-image/<customerId>/... so the reviews POST can re-verify it
// belongs to the poster before saving it.
export async function POST(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(req, "review-image", { max: 20, windowMs: 60 * 60_000, userId: user.id });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be smaller than 3MB" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(`review-image/${user.id}`, file.name);
    const url = await uploadPublicFile(buffer, key, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 502 });
  }
}
