import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Generic S3-compatible client, works unmodified against AWS S3,
// Cloudflare R2, DigitalOcean Spaces, Backblaze B2, or a self-hosted
// MinIO instance. Nothing here is Supabase-specific; whoever deploys
// this just points the env vars at whichever bucket they own.
let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

export async function uploadPublicFile(buffer, key, contentType) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const publicBase = process.env.S3_PUBLIC_URL_BASE?.replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key}`;

  // Fall back to constructing a path-style URL directly from the endpoint.
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
  return `${endpoint}/${bucket}/${key}`;
}

export async function deletePublicFile(url) {
  const key = keyFromPublicUrl(url);
  const bucket = process.env.S3_BUCKET;
  if (!key || !bucket) return;

  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // ignore, object may already be gone, or storage briefly unreachable
  }
}

function keyFromPublicUrl(url) {
  if (!url) return null;
  const bucket = process.env.S3_BUCKET;
  const publicBase = process.env.S3_PUBLIC_URL_BASE?.replace(/\/$/, "");
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
  const candidates = [publicBase, endpoint && bucket ? `${endpoint}/${bucket}` : null].filter(Boolean);

  for (const prefix of candidates) {
    if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length + 1);
  }
  return null;
}

export function isOwnedUploadUrl(url, userId) {
  const key = keyFromPublicUrl(url);
  // Not anchored to the start of the key: generateObjectKey() prefixes
  // every key with the shared storage folder (see lib/storage/index.js),
  // so "profile/<userId>/..." can appear anywhere, not just at position 0.
  return !!key && key.includes(`profile/${userId}/`);
}
