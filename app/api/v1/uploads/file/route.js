import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { uploadPublicFile, generateObjectKey } from "../../../../../lib/storage/index.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// store-logo/store-favicon are cropped client-side to a fixed small
// canvas size before upload (see ImageCropModal), so they never approach
// even this generous ceiling - product-image is the one uploaded as-is
// straight from the vendor's camera roll, so it gets its own tighter cap.
const MAX_SIZE_BY_PURPOSE = {
  "product-image": 1 * 1024 * 1024,
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
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Image must be smaller than ${Math.round(maxSize / (1024 * 1024))}MB` }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(`${purpose}/${user.id}`, file.name);
    const url = await uploadPublicFile(buffer, key, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 502 });
  }
}
