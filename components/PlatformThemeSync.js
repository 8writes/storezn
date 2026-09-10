"use client";
import { useEffect } from "react";
import { readTheme, applyTheme, forceLight } from "@/lib/theme.js";

// Mounted inside the dashboard + auth shells. On a client-side navigation
// into the platform it applies the saved theme; on the way out (unmount)
// it drops back to light so the storefront / marketing pages are never
// left dark. Hard loads are already handled by the inline script.
export function PlatformThemeSync() {
  useEffect(() => {
    applyTheme(readTheme());
    return () => forceLight();
  }, []);
  return null;
}
