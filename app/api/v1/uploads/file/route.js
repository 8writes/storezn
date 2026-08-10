import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { uploadPublicFile, generateObjectKey } from "../../../../../lib/storage/index.js";

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PURPOSES = new Set(["product-image", "store-logo", "store-favicon"]);

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
  if (!ALLOWED_PURPOSES.has(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be smaller than 8MB" }, { status: 400 });
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
