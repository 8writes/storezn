// Server side of the anti-abuse device identifier (see lib/clientDevice.js).
// Reads the headers the client attaches; falls back to a weak id derived
// from IP + user-agent when a non-JS client hits the endpoint directly.

import crypto from "crypto";

export function getClientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function readDevice(req) {
  const ip = getClientIp(req);
  let deviceId = (req.headers.get("x-device-id") || "").trim().slice(0, 64) || null;
  const fingerprint = (req.headers.get("x-device-fp") || "").trim().slice(0, 32) || null;

  if (!deviceId) {
    // No client id at all - synthesise a stable-ish one so the abuse
    // counters and bans still have something to key on.
    const ua = req.headers.get("user-agent") || "";
    deviceId = "ipua_" + crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24);
  }

  return { deviceId, fingerprint, ip };
}
