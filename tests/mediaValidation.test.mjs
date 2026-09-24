import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import {
  PRODUCT_IMAGE_SOURCE_MAX_BYTES,
  PRODUCT_IMAGE_UPLOAD_MAX_BYTES,
  PRODUCT_VIDEO_MAX_BYTES,
  matchesImageSignature,
  matchesVideoSignature,
  shouldCompressProductImage,
  validateProductImageFile,
  validateProductVideoDuration,
  validateProductVideoFile,
} from "../lib/mediaValidation.js";

if (!globalThis.File) globalThis.File = File;

test("product image validation accepts supported source images and rejects invalid type/size", () => {
  assert.equal(validateProductImageFile(new File(["x"], "photo.jpg", { type: "image/jpeg" })).ok, true);
  assert.equal(validateProductImageFile(new File(["x"], "photo.gif", { type: "image/gif" })).ok, false);
  assert.equal(validateProductImageFile({ type: "image/png", size: PRODUCT_IMAGE_SOURCE_MAX_BYTES + 1 }).ok, false);
});

test("product image compression is only needed after the upload-size target", () => {
  assert.equal(shouldCompressProductImage({ type: "image/webp", size: PRODUCT_IMAGE_UPLOAD_MAX_BYTES - 1 }), false);
  assert.equal(shouldCompressProductImage({ type: "image/webp", size: PRODUCT_IMAGE_UPLOAD_MAX_BYTES + 1 }), true);
});

test("product video validation accepts intended types and rejects invalid type/size", () => {
  assert.equal(validateProductVideoFile(new File(["x"], "clip.mp4", { type: "video/mp4" })).ok, true);
  assert.equal(validateProductVideoFile(new File(["x"], "clip.avi", { type: "video/x-msvideo" })).ok, false);
  assert.equal(validateProductVideoFile({ type: "video/webm", size: PRODUCT_VIDEO_MAX_BYTES + 1 }).ok, false);
});

test("product video duration allows 59s and 60s but rejects over 60s", () => {
  assert.equal(validateProductVideoDuration(59).ok, true);
  assert.equal(validateProductVideoDuration(60).ok, true);
  assert.equal(validateProductVideoDuration(60.4).ok, false);
});

test("media signature validation checks real file headers", () => {
  assert.equal(matchesImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(matchesImageSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesImageSignature("image/webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), true);
  assert.equal(matchesImageSignature("image/jpeg", Uint8Array.from([0x47, 0x49, 0x46, 0x38])), false);
  assert.equal(matchesVideoSignature("video/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(matchesVideoSignature("video/mp4", Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), true);
  assert.equal(matchesVideoSignature("video/quicktime", Uint8Array.from([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])), true);
  assert.equal(matchesVideoSignature("video/mp4", Uint8Array.from([0x47, 0x49, 0x46, 0x38])), false);
});

test("uploadFile returns URL on success and surfaces upload failures", async () => {
  const originalFetch = globalThis.fetch;
  const { uploadFile } = await import("../lib/clientUpload.js");
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    return Response.json({ url: "https://cdn.example/product.jpg" });
  };
  try {
    const url = await uploadFile("token", new File(["x"], "photo.jpg", { type: "image/jpeg" }), "product-image");
    assert.equal(url, "https://cdn.example/product.jpg");
    assert.equal(calls[0].headers.Authorization, "Bearer token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uploadFile throws the API error message when upload fails", async () => {
  const originalFetch = globalThis.fetch;
  const { uploadFile } = await import("../lib/clientUpload.js");
  globalThis.fetch = async () => Response.json({ error: "Storage limit reached" }, { status: 402 });
  try {
    await assert.rejects(
      () => uploadFile("token", new File(["x"], "photo.jpg", { type: "image/jpeg" }), "product-image"),
      /Storage limit reached/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
