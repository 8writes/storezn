// Browser-only: encrypts a NIN with the platform's public key before it
// ever leaves the device, so the request body and the DB row both only
// ever hold ciphertext - only lib/nin.js's decryptNin, holding the
// private key, can read it back, and that only runs when an admin
// explicitly reveals one (see the vendor NIN reveal endpoint).
function pemToArrayBuffer(pemBase64) {
  const pem = atob(pemBase64);
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedKey = null;
async function getPublicKey() {
  if (cachedKey) return cachedKey;
  const b64 = process.env.NEXT_PUBLIC_NIN_PUBLIC_KEY;
  if (!b64) throw new Error("NEXT_PUBLIC_NIN_PUBLIC_KEY is not configured");
  cachedKey = await crypto.subtle.importKey("spki", pemToArrayBuffer(b64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return cachedKey;
}

export async function encryptNin(nin) {
  const key = await getPublicKey();
  const encoded = new TextEncoder().encode(nin);
  const ciphertext = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoded);
  const bytes = new Uint8Array(ciphertext);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
