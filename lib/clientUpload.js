const IMAGE_UPLOAD_LIMITS = {
  "product-image": 3 * 1024 * 1024,
  "store-logo": 8 * 1024 * 1024,
  "store-favicon": 8 * 1024 * 1024,
};

// Browser-side image preparation keeps normal uploads unchanged, but turns
// camera-sized photos into a supported, bounded file before the server's hard
// limit and storage reservation are applied.
export async function compressImageForUpload(file, { maxBytes = 3 * 1024 * 1024, maxDimension = 2400 } = {}) {
  if (!file || !file.type?.startsWith("image/") || file.size <= maxBytes || typeof document === "undefined") return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let source;
  let objectUrl;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read image"));
        image.src = objectUrl;
      });
    }

    const originalWidth = source.width;
    const originalHeight = source.height;
    if (!originalWidth || !originalHeight) return file;

    let scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    const canvas = document.createElement("canvas");
    const preferredType = "image/webp";

    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = Math.max(1, Math.round(originalWidth * scale));
      canvas.height = Math.max(1, Math.round(originalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const type of [preferredType, "image/jpeg"]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, Math.max(0.45, 0.84 - attempt * 0.08)));
        if (!blob || blob.size > maxBytes) continue;
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
        return new File([blob], `${baseName}.${extension}`, { type: blob.type, lastModified: Date.now() });
      }

      scale *= 0.8;
    }
  } catch {
    return file;
  } finally {
    if (typeof source?.close === "function") source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  return file;
}

// Client-side helper for the generic authenticated upload endpoint
// (assignment attachments/submissions, payment proofs). Separate from
// the profile-picture upload flow (hooks/useApi + /api/v1/uploads/profile)
// since this one takes a `purpose` and returns just a URL, no user record
// to update afterward.
export async function uploadFile(token, file, purpose) {
  const preparedFile = IMAGE_UPLOAD_LIMITS[purpose]
    ? await compressImageForUpload(file, { maxBytes: IMAGE_UPLOAD_LIMITS[purpose] })
    : file;

  // Read the file fully into memory before building the request body -
  // on iOS Safari, a File picked straight from Photo Library (especially
  // with iCloud "Optimize Storage" on) can still be an unresolved
  // placeholder whose bytes haven't finished downloading yet. Streaming
  // that File directly into fetch's FormData can send a body shorter
  // than its declared size, which the server's multipart parser then
  // fails on ("No file provided"). Forcing the read here first makes
  // sure we only ever send fully-materialized bytes.
  const buffer = await preparedFile.arrayBuffer();
  const resolvedFile = new File([buffer], preparedFile.name, { type: preparedFile.type });

  const body = new FormData();
  body.append("file", resolvedFile);
  body.append("purpose", purpose);

  const res = await fetch("/api/v1/uploads/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Upload failed");
    err.status = res.status;
    throw err;
  }
  return data.url;
}

// Reads a video file's duration without uploading it, so a too-long clip
// can be rejected before spending any bandwidth/quota on it - the actual
// enforcement backstop server-side is file size (see MAX_SIZE_BY_PURPOSE
// in app/api/v1/uploads/file/route.js), this is purely a fast client-side
// UX check, easy for a determined user to bypass, not a security control.
export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video"));
    };
    video.src = url;
  });
}

// Cleans up a file that was uploaded but never got attached to anything -
// see the DELETE handler in app/api/v1/uploads/file/route.js for when
// this is actually needed. Best-effort by design at every call site: a
// removed-before-save photo not immediately vanishing from storage is a
// much smaller problem than blocking the user's actual action on it.
export async function deleteUploadedFile(token, url) {
  await fetch("/api/v1/uploads/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}
