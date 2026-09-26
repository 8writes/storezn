"use client";
// Desktop sidebar collapse (icons only), remembered per browser.
//
// Same shape as lib/theme.js: a localStorage value read on mount and
// changed from more than one place. Exposed as an external store so the
// layout can subscribe to it with useSyncExternalStore instead of copying
// it into React state from an effect, which rendered the sidebar expanded
// for one frame before snapping to the remembered state.
export const NAV_COLLAPSED_KEY = "nav_collapsed";
export const NAV_COLLAPSED_EVENT = "storezn:navcollapse";

export function readNavCollapsed() {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    // private mode / blocked storage - just start expanded
    return false;
  }
}

export function saveNavCollapsed(collapsed) {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_COLLAPSED_EVENT));
  return collapsed;
}

export function subscribeToNavCollapsed(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NAV_COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Matches the server-rendered default (expanded).
export function getServerNavCollapsed() {
  return false;
}
