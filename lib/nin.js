import crypto from "crypto";

// Server-only: decrypts a NIN encrypted client-side with the matching
// public key (see lib/ninClient.js). The private key never leaves this
// process - it's not exposed to the browser, unlike NEXT_PUBLIC_NIN_
// PUBLIC_KEY. Keys are stored base64-encoded in env vars since the raw
// PEM's embedded newlines don't round-trip cleanly through Vercel's env
// var UI or a single-line .env value.
function decodePem(base64) {
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function decryptNin(ciphertextBase64) {
  if (!process.env.NIN_PRIVATE_KEY) throw new Error("NIN_PRIVATE_KEY is not configured");
  const privateKey = decodePem(process.env.NIN_PRIVATE_KEY);
  const buffer = Buffer.from(ciphertextBase64, "base64");
  const decrypted = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    buffer,
  );
  return decrypted.toString("utf-8");
}
