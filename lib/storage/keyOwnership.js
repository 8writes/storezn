// Shared by both storage providers (cloudinary.js, s3.js) for their
// isOwnedUploadUrl(). It lives in its own module rather than in
// storage/index.js because index.js imports the providers - putting it
// there would make the import cycle back on itself.
//
// Every key generateObjectKey() can produce is
// "<BASE_FOLDER>/<purpose>/<owner id>/<nanoid>.<ext>" - see its two call
// sites, /api/v1/uploads/file and the review-image upload. So ownership is
// "does this key sit under <purpose>/<userId>/ for a purpose we actually
// issue?".
//
// One definition, because the two providers had drifted into different
// answers: Cloudinary matched "/<userId>/" under any purpose at all, while
// S3 matched only `profile/` (a purpose nothing has ever produced) and
// `review-image/`. DELETE /api/v1/uploads/file uses this as its only
// ownership check, so under S3 every real product-image or store-logo
// cleanup was rejected as not-owned.
export const UPLOAD_PURPOSES = ["product-image", "product-video", "store-logo", "store-favicon", "review-image"];

export function keyBelongsToUser(key, userId) {
  if (!key || !userId) return false;
  return UPLOAD_PURPOSES.some((purpose) => key.includes(`${purpose}/${userId}/`));
}
