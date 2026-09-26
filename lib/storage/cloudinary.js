import { keyBelongsToUser } from "./keyOwnership.js";
import crypto from "crypto";

// Cloudinary's own REST API directly (no SDK dependency, matches how the
// rest of this app talks to SendPulse/Paystack), signed per their upload
// API spec: sort every param except file/api_key/signature, join as
// "key=value&key=value", append the API secret, SHA-1 the result.
function sign(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

function getConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)");
  }
  return { cloudName, apiKey, apiSecret };
}

// f_auto (best format per viewer, WebP/AVIF where supported) + q_auto
// (automatic quality), applied on top of the compression the client
// already does before upload, not instead of it, this optimizes delivery
// per-viewer beyond what a single pre-uploaded file could do alone.
// Only meaningful for images; raw files (PDF, docx, etc.) get no transform.
const TRANSFORM = "f_auto,q_auto";
// Video delivery only gets q_auto (compression) - f_auto is an
// image-format-negotiation transform, keeping the original container
// (mp4/webm) is what every <video> tag actually wants.
const VIDEO_TRANSFORM = "q_auto";

// Cloudinary buckets uploads by resource_type, and destroy/delivery URLs
// must use the same one the file was uploaded under. Product videos (see
// app/api/v1/uploads/file/route.js's "product-video" purpose) need
// "video" specifically, not "raw" - anything else non-image still falls
// back to "raw".
function resourceTypeFor(contentType) {
  if (contentType?.startsWith("image/")) return "image";
  if (contentType?.startsWith("video/")) return "video";
  return "raw";
}

export async function uploadPublicFile(buffer, key, contentType) {
  const { url } = await uploadPublicFileWithMetadata(buffer, key, contentType);
  return url;
}

export async function uploadPublicFileWithMetadata(buffer, key, contentType) {
  const { cloudName, apiKey, apiSecret } = getConfig();
  const resourceType = resourceTypeFor(contentType);

  // Cloudinary tracks format separately from public_id, strip the
  // extension generateObjectKey() added, it'd otherwise become literally
  // part of the id (e.g. "banner.jpg.jpg" once Cloudinary appends format).
  const publicId = key.replace(/\.[^./]+$/, "");

  // Newer ("Dynamic Folder Mode") Cloudinary accounts no longer place an
  // asset into a folder just because its public_id contains slashes - an
  // explicit `folder` param is required for it to actually show up
  // nested in the Media Library instead of dumped in Home. Splitting it
  // out here works on both old and new accounts; the delivery URL is
  // unaffected either way (Cloudinary's response `public_id` is still
  // the full "folder/id" path).
  const lastSlash = publicId.lastIndexOf("/");
  const folder = lastSlash === -1 ? null : publicId.slice(0, lastSlash);
  const id = lastSlash === -1 ? publicId : publicId.slice(lastSlash + 1);

  const timestamp = Math.floor(Date.now() / 1000);
  const signParams = { public_id: id, timestamp, ...(folder && { folder }) };
  const signature = sign(signParams, apiSecret);

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }));
  form.append("public_id", id);
  if (folder) form.append("folder", folder);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (resourceType === "image") return { url: `https://res.cloudinary.com/${cloudName}/image/upload/${TRANSFORM}/${data.public_id}.${data.format}` };
  if (resourceType === "video") {
    return {
      url: `https://res.cloudinary.com/${cloudName}/video/upload/${VIDEO_TRANSFORM}/${data.public_id}.${data.format}`,
      durationSeconds: Number.isFinite(data.duration) ? data.duration : null,
    };
  }
  return { url: `https://res.cloudinary.com/${cloudName}/raw/upload/${data.public_id}.${data.format}` };
}

export async function deletePublicFile(url) {
  const { publicId, resourceType } = infoFromUrl(url);
  if (!publicId) return;

  try {
    const { cloudName, apiKey, apiSecret } = getConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign({ public_id: publicId, timestamp }, apiSecret);

    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        api_key: apiKey,
        signature,
      }),
    });
  } catch {
    // best-effort, same as the S3 path, a stale/already-gone object or a
    // momentary Cloudinary outage shouldn't block whatever triggered this
  }
}

function infoFromUrl(url) {
  if (!url) return { publicId: null, resourceType: null };
  for (const resourceType of ["image", "video", "raw"]) {
    const marker = resourceType === "image" ? `/image/upload/${TRANSFORM}/` : resourceType === "video" ? `/video/upload/${VIDEO_TRANSFORM}/` : "/raw/upload/";
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return { publicId: url.slice(idx + marker.length).replace(/\.[^./]+$/, ""), resourceType };
    }
  }
  return { publicId: null, resourceType: null };
}

export function isOwnedUploadUrl(url, userId) {
  const { publicId } = infoFromUrl(url);
  // Not anchored to the start: generateObjectKey() prefixes every key with
  // the shared storage folder (see lib/storage/index.js), so the purpose/
  // owner segment sits somewhere in the middle of the path. The predicate
  // itself is shared with the S3 provider so the two can't drift.
  return keyBelongsToUser(publicId, userId);
}
