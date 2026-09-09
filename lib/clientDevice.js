"use client";
// A per-browser identifier for anti-abuse (device bans). Disclosed in the
// privacy policy. Two parts, both sent as request headers on auth calls:
//   x-device-id  - a random id minted once and kept in localStorage
//   x-device-fp  - a hash of a few stable browser signals, so a fresh
//                  localStorage (cleared site data) still looks familiar
// Neither is used for tracking or advertising.

const KEY = "storezn_did";

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

let cached = null;

export function deviceHeaders() {
  if (typeof window === "undefined") return {};
  if (cached) return cached;

  let id;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(KEY, id);
    }
  } catch {
    id = uuid(); // private mode - a fresh id each load, the fingerprint carries it
  }

  let fp = "";
  try {
    const n = window.navigator || {};
    const s = window.screen || {};
    const signals = [
      n.userAgent || "",
      n.language || "",
      (n.languages || []).join(","),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      `${s.width || 0}x${s.height || 0}x${s.colorDepth || 0}`,
      n.platform || "",
      n.hardwareConcurrency || "",
      n.deviceMemory || "",
      n.maxTouchPoints || "",
    ].join("|");
    fp = fnv1a(signals);
  } catch {
    fp = "";
  }

  cached = { "x-device-id": id, "x-device-fp": fp };
  return cached;
}
