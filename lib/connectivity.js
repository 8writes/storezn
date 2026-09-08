"use client";
// A shared "are we actually online" signal. navigator.onLine only knows
// whether the OS has a network interface - it stays true on a connected
// Wi-Fi with a dead uplink. So we also flip offline the moment a real
// request fails with a network error (see useApi) and back online the
// moment one succeeds. The dashboard shell subscribes to this to make
// the sidebar inert while offline.

let markedOffline = false;
const listeners = new Set();

function emit() {
  const v = isOffline();
  for (const fn of listeners) {
    try {
      fn(v);
    } catch {
      /* a listener throwing must not break the others */
    }
  }
}

export function isOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return markedOffline;
}

// Called by useApi when fetch() itself rejects (no response at all).
export function markOffline() {
  if (!markedOffline) {
    markedOffline = true;
    emit();
  }
}

// Called by useApi whenever a response comes back (even a 4xx/5xx - we
// still reached the server) and on the window `online` event.
export function markOnline() {
  if (markedOffline) {
    markedOffline = false;
    emit();
  }
}

export function onConnectivityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", markOffline);
  window.addEventListener("online", () => {
    markOnline();
    emit(); // navigator.onLine flipped - re-notify even if our flag was already clear
  });
}
