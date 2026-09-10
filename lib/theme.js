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

// Path prefixes that are "the platform" - kept in sync with the inline
// script in app/layout.js.
export const PLATFORM_RE = /^\/(vendor|super-admin|dashboard|profile|login|signup|forgot-password|reset-password|verify-email)(\/|$)/;
