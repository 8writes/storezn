"use client";
// Dark / light for the PLATFORM only (dashboard, admin, auth). The
// storefront and marketing pages never set `data-theme`, so they always
// render the :root light values. Default is dark.
//
// A no-FOUC inline script in app/layout.js sets `data-theme` before the
// first paint on platform routes; PlatformThemeSync keeps it right on
// client-side navigation, and ThemeToggle flips it.

export const THEME_KEY = "storezn_theme";
export const THEME_EVENT = "storezn:themechange";

export function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

// Theme lives in localStorage and is broadcast on THEME_EVENT, which makes
// it an external store - so components read it through
// useSyncExternalStore rather than copying it into state from an effect.
// The server snapshot is the default ("dark"), matching the no-FOUC inline
// script in app/layout.js, so the first client render agrees with the HTML.
export function subscribeToTheme(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, onChange);
  // Another tab changing the theme writes the same key.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getServerTheme() {
  return "dark";
}

export function applyTheme(theme) {
  const v = theme === "light" ? "light" : "dark";
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", v);
  return v;
}

export function forceLight() {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", "light");
}

export function saveTheme(theme) {
  const v = theme === "light" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, v);
  } catch {
    /* private mode */
  }
  applyTheme(v);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_EVENT));
  return v;
}

// Path prefixes that follow the theme - the signed-in vendor / admin
// dashboard only. Auth pages, the storefront and every marketing page
// stay light. Kept in sync with the inline script in app/layout.js.
export const PLATFORM_RE = /^\/(vendor|super-admin|dashboard|profile)(\/|$)/;
