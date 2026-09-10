"use client";
import { useEffect } from "react";
import { readTheme, applyTheme, forceLight } from "@/lib/theme.js";

// Mounted inside the dashboard shell. On a client-side navigation into
// the dashboard it applies the saved theme; on the way out (unmount) it
// drops back to light so auth / storefront / marketing are never left
// dark. Hard loads are already handled by the inline script.
export function PlatformThemeSync() {
  useEffect(() => {
    applyTheme(readTheme());
    return () => forceLight();
  }, []);
  return null;
}

// For pages that must always be light (auth) even if the dashboard was
// last seen dark and this was a client-side navigation.
export function ForceLightTheme() {
  useEffect(() => {
    forceLight();
  }, []);
  return null;
}
