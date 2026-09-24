export const PRODUCT_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_DIMENSION = 2400;
export const PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const PRODUCT_VIDEO_MAX_SECONDS = 60;

export const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PRODUCT_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function formatUploadSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${mb.toFixed(1)}MB`;
}

export function validateProductImageFile(file) {
  if (!file) return { ok: false, error: "Choose an image to upload" };
  if (!PRODUCT_IMAGE_TYPES.has(file.type)) return { ok: false, error: "Only JPEG, PNG, or WebP images are allowed" };
  if (file.size > PRODUCT_IMAGE_SOURCE_MAX_BYTES) {
    return { ok: false, error: `Images can be up to ${formatUploadSize(PRODUCT_IMAGE_SOURCE_MAX_BYTES)} before compression.` };
  }
  return { ok: true };
}

export function validateProductVideoFile(file) {
  if (!file) return { ok: false, error: "Choose a video to upload" };
  if (!PRODUCT_VIDEO_TYPES.has(file.type)) return { ok: false, error: "Only MP4, WebM, or MOV videos are allowed" };
  if (file.size > PRODUCT_VIDEO_MAX_BYTES) {
    return { ok: false, error: `Product videos can be up to ${formatUploadSize(PRODUCT_VIDEO_MAX_BYTES)}.` };
  }
  return { ok: true };
}

export function validateProductVideoDuration(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { ok: false, error: "Could not read that video file" };
  if (durationSeconds > PRODUCT_VIDEO_MAX_SECONDS + 0.25) {
    return { ok: false, error: "Product videos can be up to 1 minute long." };
  }
  return { ok: true };
}

export function shouldCompressProductImage(file, maxBytes = PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
  return !!file && PRODUCT_IMAGE_TYPES.has(file.type) && file.size > maxBytes;
}

function textAt(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function matchesImageSignature(contentType, bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes || []);
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && textAt(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/webp") return bytes.length >= 12 && textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP";
  return false;
}

export function matchesVideoSignature(contentType, bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes || []);
  if (contentType === "video/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (contentType === "video/mp4" || contentType === "video/quicktime") return bytes.length >= 12 && textAt(bytes, 4, 4) === "ftyp";
  return false;
}
